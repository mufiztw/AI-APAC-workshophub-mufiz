export const meta = {
  name: 'deliver-story',
  description:
    'Deliver a WorkshopHub story end-to-end: kickoff, SPDD analysis/canvas/generate, sensors, sync and finish',
  whenToUse:
    'Pass args: { storyId: "LATC-<number>" } to run the full card-to-PR flow for any story',
  phases: [
    { title: 'kickoff', detail: 'read the card, work on a copy, save story, create branch' },
    { title: 'spdd', detail: 'analysis, REASONS canvas, generate code' },
    { title: 'sensor', detail: 'run every quality sensor and fix failures' },
    { title: 'finish', detail: 'sync canvas with code, then finish-dev' },
  ],
}

const storyId = typeof args === 'string' ? args : args && args.storyId
if (typeof storyId !== 'string' || !/^[A-Z][A-Z0-9]+-[0-9]+$/.test(storyId)) {
  throw new Error('deliver-story needs args.storyId in the form LATC-<number>')
}

const lower = storyId.toLowerCase()
const context =
  `Story ${storyId}. Its story file is the newest ./stories/${lower}-*.md; the work is on the ` +
  `branch named ${lower}-*. Background agent: nobody can answer questions, so use sensible defaults and say what you chose.`

phase('kickoff')
await agent(
  `Follow kickoff.md for ${storyId}. Background agent: nobody can answer questions. Use the name "Mufiz" ` +
    `for the copied card, and move the copy to "In Progress" if "In Development" does not exist. ` +
    `Start from main. Never edit the original card.`,
  { label: `kickoff:${storyId}`, phase: 'kickoff' }
)

phase('spdd')
await agent(`/spdd-analysis @./stories/${lower}-*.md (the story file for ${storyId}). ${context}`, {
  label: 'spdd-analysis',
  phase: 'spdd',
})
await agent(
  `/spdd-reasons-canvas using the newest spdd/analysis/*${storyId}* file as input. ${context} ` +
    `Do not wait for confirmation to implement; stop after saving the canvas.`,
  { label: 'spdd-reasons-canvas', phase: 'spdd' }
)
await agent(
  `/spdd-generate from the newest spdd/prompt/*${storyId}* canvas. ${context} Follow Red-Green-Refactor TDD per CLAUDE.md.`,
  { label: 'spdd-generate', phase: 'spdd' }
)

phase('sensor')
await agent(`/sensor-and-fix. ${context}`, { label: 'sensor-and-fix', phase: 'sensor' })

phase('finish')
await agent(`/spdd-sync for ${storyId}. ${context}`, { label: 'spdd-sync', phase: 'finish' })
await agent(
  `/finish-dev for ${storyId}. ${context} The user explicitly asked for the push and the pull request in this run. ` +
    `Never force-push and never use --no-verify.`,
  { label: 'finish-dev', phase: 'finish' }
)

return { storyId, phases: ['kickoff', 'spdd', 'sensor', 'finish'] }
