import "server-only";
import harness from "../../../harnessrouter.json";

// The server maps the feature to its harness; the browser never sends or sees this id.
export const RESEARCH_HARNESS_ID: string = harness.harness_id;
