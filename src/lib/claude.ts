import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

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

Respond with valid JSON matching this schema:
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

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Failed Tests\n\n${failureSummary}\n\n## PR Diff\n\n\`\`\`diff\n${prDiff}\n\`\`\`\n\nAnalyze these failures and respond with JSON.`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      verdict: "unclear",
      confidence: 0,
      reasoning: "Failed to parse Claude response",
      failedTests: [],
    };
  }

  return JSON.parse(jsonMatch[0]) as AnalysisResult;
}
