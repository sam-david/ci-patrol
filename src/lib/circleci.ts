const TOKEN = process.env.CIRCLECI_TOKEN!;
const PROJECT_SLUG = process.env.CIRCLECI_PROJECT_SLUG!;
const BASE_URL = "https://circleci.com/api/v2";

async function circleRequest(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Circle-Token": TOKEN,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CircleCI API error ${res.status}: ${text}`);
  }

  return res.json();
}

export interface Pipeline {
  id: string;
  number: number;
  state: string;
  created_at: string;
  trigger: { type: string };
  vcs: { branch: string };
}

export interface Workflow {
  id: string;
  name: string;
  status: string;
  pipeline_id: string;
  created_at: string;
  stopped_at: string | null;
}

export interface Job {
  id: string;
  name: string;
  status: string;
  job_number: number;
  started_at: string | null;
  stopped_at: string | null;
}

export interface TestResult {
  message: string;
  source: string;
  run_time: number;
  file: string;
  result: string;
  name: string;
  classname: string;
}

/** Get the latest pipeline for a branch */
export async function getLatestPipeline(
  branch: string
): Promise<Pipeline | null> {
  const data = await circleRequest(
    `/project/${PROJECT_SLUG}/pipeline?branch=${encodeURIComponent(branch)}`
  );
  return data.items?.[0] ?? null;
}

/** Get pipelines status for multiple branches at once (batch optimization) */
export async function getPipelinesForBranches(
  branches: string[]
): Promise<Map<string, Pipeline>> {
  const results = new Map<string, Pipeline>();
  // CircleCI doesn't have a batch endpoint, so fetch in parallel
  const promises = branches.map(async (branch) => {
    try {
      const pipeline = await getLatestPipeline(branch);
      if (pipeline) results.set(branch, pipeline);
    } catch {
      // Silently skip branches with no pipelines
    }
  });
  await Promise.all(promises);
  return results;
}

/** Get workflows for a pipeline */
export async function getWorkflows(pipelineId: string): Promise<Workflow[]> {
  const data = await circleRequest(`/pipeline/${pipelineId}/workflow`);
  return data.items ?? [];
}

/** Get jobs for a workflow */
export async function getJobs(workflowId: string): Promise<Job[]> {
  const data = await circleRequest(`/workflow/${workflowId}/job`);
  return data.items ?? [];
}

/** Get test results for a job */
export async function getTestResults(
  jobNumber: number
): Promise<TestResult[]> {
  const data = await circleRequest(
    `/project/${PROJECT_SLUG}/${jobNumber}/tests`
  );
  return data.items ?? [];
}

/** Derive an overall CI status from a pipeline's workflows */
export async function getPipelineStatus(
  pipelineId: string
): Promise<"running" | "success" | "failed" | "pending" | "canceled"> {
  const workflows = await getWorkflows(pipelineId);
  if (workflows.length === 0) return "pending";

  const statuses = workflows.map((w) => w.status);

  if (statuses.some((s) => s === "failing" || s === "failed")) return "failed";
  if (statuses.some((s) => s === "running" || s === "on_hold")) return "running";
  if (statuses.every((s) => s === "success")) return "success";
  if (statuses.some((s) => s === "canceled")) return "canceled";

  return "pending";
}

/** Get failed jobs with their test output for a pipeline */
export async function getFailedJobDetails(
  pipelineId: string
): Promise<
  { workflowId: string; jobName: string; jobNumber: number; failedTests: TestResult[] }[]
> {
  const workflows = await getWorkflows(pipelineId);
  const results: {
    workflowId: string;
    jobName: string;
    jobNumber: number;
    failedTests: TestResult[];
  }[] = [];

  for (const workflow of workflows) {
    if (workflow.status !== "failed" && workflow.status !== "failing") continue;

    const jobs = await getJobs(workflow.id);
    for (const job of jobs) {
      if (job.status !== "failed") continue;

      const tests = await getTestResults(job.job_number);
      const failedTests = tests.filter((t) => t.result === "failure");

      results.push({
        workflowId: workflow.id,
        jobName: job.name,
        jobNumber: job.job_number,
        failedTests,
      });
    }
  }

  return results;
}

/** Rerun a workflow from failed jobs only */
export async function rerunWorkflowFromFailed(
  workflowId: string
): Promise<void> {
  await circleRequest(`/workflow/${workflowId}/rerun`, {
    method: "POST",
    body: JSON.stringify({ from_failed: true }),
  });
}
