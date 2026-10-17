import { Context } from '@deepseek-ai/cordis'
import systemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'

const ctx = new Context()
await ctx.plugin(systemPrompt, { personaSuffix: 'Your working directory is {{cwd}}.' })
await new Promise(r => setTimeout(r, 25))

let assembly = await ctx.systemPrompt.assemble()
console.log('vars before:', JSON.stringify(assembly.variables))
try { renderPrompt(assembly) } catch (e) { console.log('render1 ERROR:', e.message) }

// first registration
const off = ctx.systemPrompt.variable('cwd', () => '/first')
console.log('registered once ok; vars:', JSON.stringify((await ctx.systemPrompt.assemble()).variables))

// duplicate
let sync = 'no-throw'
try { ctx.systemPrompt.variable('cwd', () => '/second') } catch (e) { sync = 'THREW: ' + e.message }
console.log('duplicate ->', sync)
await new Promise(r => setTimeout(r, 25))
console.log('after settle vars:', JSON.stringify((await ctx.systemPrompt.assemble()).variables))
console.log('render2:', renderPrompt(await ctx.systemPrompt.assemble()))
off()
console.log('after off vars:', JSON.stringify((await ctx.systemPrompt.assemble()).variables))
process.exit(0)
