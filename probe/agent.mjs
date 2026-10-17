import { Context } from '@deepseek-ai/cordis'
import systemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'

const ctx = new Context()
await ctx.plugin(systemPrompt, { personaSuffix: 'Your working directory is {{cwd}}.' })
await new Promise(r => setTimeout(r, 25))

// provider that returns undefined
ctx.systemPrompt.variable('cwd', c => c.agent === undefined ? undefined : '/from-agent')
const agent = { session: { header: { cwd: '/original' } } }
try { renderPrompt(await ctx.systemPrompt.assemble()) } catch (e) { console.log('no-agent ERROR:', e.message) }
console.log('with-agent:', JSON.stringify(renderPrompt(await ctx.systemPrompt.assemble({ agent }))))

// can a plugin provide a plain service object?
const fake = { get: s => '/from-service' }
await ctx.plugin({ name: 'fake-wd', apply(c) { c.provide('workingDirectory', fake) } })
await new Promise(r => setTimeout(r, 25))
console.log('workingDirectory via ctx.get:', typeof ctx.get('workingDirectory'), ctx.get('workingDirectory')?.get(agent.session))
process.exit(0)
