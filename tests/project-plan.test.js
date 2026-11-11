import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const plan = JSON.parse(readFileSync(new URL('../docs/github-plan.json', import.meta.url), 'utf8'))
const workflow = readFileSync(new URL('../.github/workflows/project-plan.yml', import.meta.url), 'utf8')
const source = workflow.replace(/\r\n/g, '\n').split('          script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n')
const run = new (Object.getPrototypeOf(async function () {}).constructor)('require', 'github', 'context', 'core', source)

test('project plan publishes linked issues once and preserves user bodies/states across renames', async () => {
  const milestones = [], issues = []
  const github = {
    paginate: async method => method === 'milestones' ? [...milestones] : [...issues],
    rest: { issues: {
      listMilestones: 'milestones', listForRepo: 'issues',
      createMilestone: async args => {
        const item = { ...args, number: milestones.length + 1 }; milestones.push(item); return { data: item }
      },
      updateMilestone: async args => {
        Object.assign(milestones.find(item => item.number === args.milestone_number), { description: args.description })
        return { data: {} }
      },
      create: async args => {
        const item = { ...args, number: issues.length + 1, milestone: { number: args.milestone }, state: 'open', html_url: 'https://example.test/issue' }
        issues.push(item); return { data: item }
      },
      update: async args => {
        const item = issues.find(issue => issue.number === args.issue_number)
        Object.assign(item, { title: args.title, milestone: { number: args.milestone } }); return { data: item }
      },
    } },
  }
  const core = { info() {}, summary: { addHeading() { return this }, addRaw() { return this }, async write() {} } }
  const withPlan = value => name => name === 'node:fs' ? { readFileSync: () => JSON.stringify(value) } : require(name)
  const publish = value => run(withPlan(value), github, { repo: { owner: 'owner', repo: 'repo' } }, core)
  await publish(plan)
  assert.equal(milestones.length, 4)
  assert.equal(issues.length, 15)
  for (const [index, item] of plan.issues.entries()) {
    for (const dependency of item.dependsOn) {
      const number = plan.issues.findIndex(issue => issue.key === dependency) + 1
      assert.match(issues[index].body, new RegExp(`#${number}(?:,|\\n)`))
    }
  }
  issues[0].title = 'An older dashboard title'
  issues[0].body = 'Keep user notes\n\n<!-- netwatch-plan:dashboard-ui -->'
  issues[0].state = 'closed'
  milestones[0].description = 'An outdated milestone description'
  await publish(plan)
  assert.equal(issues.length, 15)
  assert.equal(milestones.length, 4)
  assert.equal(issues[0].title, plan.issues[0].title)
  assert.equal(issues[0].body, 'Keep user notes\n\n<!-- netwatch-plan:dashboard-ui -->')
  assert.equal(issues[0].state, 'closed')
  assert.equal(milestones[0].description, plan.milestones[0].description)

  const invalid = structuredClone(plan)
  invalid.issues[0].dependsOn = ['missing']
  await assert.rejects(publish(invalid), /Dependencies must precede/)
  assert.equal(issues.length, 15)
})
