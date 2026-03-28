import { spawn } from "child_process";

export interface TestFailureInfo {
  jobName: string;
  failedTests: {
    name: string;
    file: string;
    message: string;
  }[];
}

export interface AnalysisResult {
  verdict: "flaky" | "legitimate" | "unclear";
  confidence: number;
  reasoning: string;
  failedTests: {
    name: string;
    classification: "flaky" | "legitimate" | "unclear";
    reason: string;
  }[];
}

const SYSTEM_PROMPT = `You are a CI failure analyst for a Ruby on Rails application (GiveCampus).
Your job is to determine whether test failures are "flaky" (unrelated to code changes) or "legitimate" (caused by the PR's code changes).

## Context about this CI environment:
- RSpec tests with rspec-retry (3 attempts). If a test still fails, it already failed 3 times.
- Feature specs use headless Chrome via Capybara + Ferrum (Chrome DevTools Protocol).
- 32-node parallelism for unit specs, 50-node for feature specs.
- OpenSearch is used for search functionality.
- PostgreSQL database with test parallelization.

## Common FLAKY failure patterns (infrastructure/timing):
- Net::ReadTimeout, Net::OpenTimeout
- Ferrum::DeadBrowserError, Ferrum::TimeoutError
- Selenium::WebDriver errors (session, connection)
- "element not found" or "element not interactable" in feature specs (timing)
- Database lock timeouts, deadlocks
- OpenSearch indexing delays (stale search results)
- "Connection refused" errors
- Asset compilation timeouts
- Random order-dependent test failures (test passes alone, fails in suite)
- Capybara::ElementNotFound with generic elements (modals, dropdowns)

## Common LEGITIMATE failure patterns:
- NoMethodError, NameError, ArgumentError
- Assertion failures where the expected value relates to code changes
- Missing template/partial errors after file renames
- Schema/migration errors after model changes
- Routing errors after route changes
- Validation failures related to changed validations
- JavaScript errors in changed React components

## Decision rules:
1. Compare each failed test's file path against the PR diff. If the test file or the code it tests was modified in the PR, lean toward "legitimate".
2. If the error message matches a known flaky pattern AND the failing test/code wasn't modified in the PR, classify as "flaky".
3. If uncertain, classify as "unclear" — we'd rather not auto-rerun a legitimate failure.
4. If ANY test is "legitimate", the overall verdict MUST be "legitimate".
5. Only return "flaky" when ALL failures appear unrelated to code changes.

Respond ONLY with valid JSON matching this schema (no markdown, no code fences, no explanation outside the JSON):
{
  "verdict": "flaky" | "legitimate" | "unclear",
  "confidence": 0.0 to 1.0,
  "reasoning": "1-2 sentence summary",
  "failedTests": [
    {
      "name": "test name or file",
      "classification": "flaky" | "legitimate" | "unclear",
      "reason": "brief explanation"
    }
  ]
}`;

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["-p", "--output-format", "text"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start claude CLI: ${err.message}`));
    });

    // Send prompt via stdin and close
    proc.stdin.write(prompt);
    proc.stdin.end();

    // Timeout after 2 minutes
    setTimeout(() => {
      proc.kill();
      reject(new Error("Claude Code CLI timed out after 120s"));
    }, 120_000);
  });
}

export async function analyzeFailure(
  failures: TestFailureInfo[],
  prDiff: string
): Promise<AnalysisResult> {
  const failureSummary = failures
    .map(
      (f) =>
        `## Job: ${f.jobName}\n${f.failedTests
          .map(
            (t) =>
              `- **${t.file}**: ${t.name}\n  Error: ${t.message.slice(0, 500)}`
          )
          .join("\n")}`
    )
    .join("\n\n");

  const prompt = `${SYSTEM_PROMPT}\n\n---\n\n## Failed Tests\n\n${failureSummary}\n\n## PR Diff\n\n\`\`\`diff\n${prDiff}\n\`\`\`\n\nAnalyze these failures and respond with JSON only.`;

  try {
    const text = await runClaude(prompt);

    // Extract JSON from response (handle potential markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Failed to extract JSON from Claude Code output:", text.slice(0, 500));
      return {
        verdict: "unclear",
        confidence: 0,
        reasoning: "Failed to parse Claude Code response",
        failedTests: [],
      };
    }

    return JSON.parse(jsonMatch[0]) as AnalysisResult;
  } catch (error) {
    console.error("Claude Code CLI error:", error);
    return {
      verdict: "unclear",
      confidence: 0,
      reasoning: `Claude Code CLI failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      failedTests: [],
    };
  }
}
