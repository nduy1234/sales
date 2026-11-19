/** True when the request asks the agent to publish or schedule (the harness treats that as authorization). */
export function requestsPublishing(text: string) {
  return text
    .split(/\r?\n/)
    .some((l) => /\b(publish|post now|schedule)\b/i.test(l) && !/do not publish or schedule|drafts? only/i.test(l));
}

