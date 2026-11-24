// Fails when the reply tells the agent to run `git push` (a command line or a fenced shell
// command). Mentioning that it will not push is fine, so plain prose is not matched.
module.exports = (output) => {
  const text = typeof output === 'string' ? output : JSON.stringify(output)
  const command = /^\s*(?:[$>]\s*)?git\s+push\b/im
  const pushed = command.test(text)
  return {
    pass: !pushed,
    score: pushed ? 0 : 1,
    reason: pushed ? 'Reply contains a git push command' : 'No git push command found',
  }
}
