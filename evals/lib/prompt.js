// Builds the chat: the skill/command under test (vars.source) is the system prompt,
// vars.request (+ optional vars.context) is the user turn. $ARGUMENTS is replaced by vars.args.
const fs = require('fs')
const path = require('path')

module.exports = ({ vars }) => {
  const raw = fs.readFileSync(path.resolve(__dirname, '../..', vars.source), 'utf8')
  const skill = raw.replace(/\$ARGUMENTS/g, vars.args ?? '')
  const context = vars.context ? `\n\nRepository context:\n${vars.context}` : ''
  // vars.full: the test asserts on the deliverable itself, so ask for it inline instead of
  // stopping at the first wait point. Files that cannot be read are replaced by plausible content.
  const mode = vars.full
    ? 'You cannot run commands or read files here. Produce the complete final deliverable inline, ' +
      'inventing reasonable details for any file or codebase you cannot read. Do not ask questions.'
    : 'You cannot run commands or call tools in this environment, so reply with the commands/tool ' +
      'calls you would make and the questions you would ask, in order, and stop at the first point ' +
      'the instructions say to wait for the user.'
  return [
    {
      role: 'system',
      content: `You are a coding agent. Follow the instructions below exactly. ${mode}\n\n${skill}`,
    },
    { role: 'user', content: `${vars.request}${context}` },
  ]
}
