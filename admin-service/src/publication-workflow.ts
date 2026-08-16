import type { PublicationState } from "./curation-types.js";

type WorkflowRunSummary = {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
};

export type DeploymentWorkflowProgress = {
  state: Extract<PublicationState, "validating" | "deploying" | "failed">;
  workflowDone: boolean;
  workflowUrl: string | null;
};

export const deploymentWorkflowProgress = (
  runs: WorkflowRunSummary[],
): DeploymentWorkflowProgress => {
  const deploy = runs.find((run) => run.name === "Deploy production");
  const failed =
    deploy?.status === "completed" &&
    deploy.conclusion !== null &&
    deploy.conclusion !== "success";
  if (failed) {
    return {
      state: "failed",
      workflowDone: false,
      workflowUrl: deploy.html_url,
    };
  }

  const workflowDone =
    deploy?.status === "completed" && deploy.conclusion === "success";
  return {
    state: workflowDone ? "deploying" : "validating",
    workflowDone,
    workflowUrl: deploy?.html_url ?? null,
  };
};
