import assert from "node:assert/strict";
import test from "node:test";

import { deploymentWorkflowProgress } from "../src/publication-workflow.js";

test("publication waits for its single deployment workflow", () => {
  assert.deepEqual(deploymentWorkflowProgress([]), {
    state: "validating",
    workflowDone: false,
    workflowUrl: null,
  });
  assert.deepEqual(
    deploymentWorkflowProgress([
      {
        name: "Deploy production",
        status: "in_progress",
        conclusion: null,
        html_url: "https://github.example/actions/1",
      },
    ]),
    {
      state: "validating",
      workflowDone: false,
      workflowUrl: "https://github.example/actions/1",
    },
  );
});

test("publication moves to rollout only after the workflow succeeds", () => {
  assert.deepEqual(
    deploymentWorkflowProgress([
      {
        name: "Deploy production",
        status: "completed",
        conclusion: "success",
        html_url: "https://github.example/actions/2",
      },
    ]),
    {
      state: "deploying",
      workflowDone: true,
      workflowUrl: "https://github.example/actions/2",
    },
  );
});

test("publication reports a failed deployment workflow", () => {
  assert.deepEqual(
    deploymentWorkflowProgress([
      {
        name: "Deploy production",
        status: "completed",
        conclusion: "failure",
        html_url: "https://github.example/actions/3",
      },
    ]),
    {
      state: "failed",
      workflowDone: false,
      workflowUrl: "https://github.example/actions/3",
    },
  );
});
