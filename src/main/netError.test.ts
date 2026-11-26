// node --experimental-strip-types src/main/netError.test.ts
import assert from 'node:assert/strict'
import { netError } from './netError.ts'

const fail = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: { code } })
const h = 'api.exemplo.com'

assert.match(netError(fail('UND_ERR_CONNECT_TIMEOUT'), h), /não respondeu.*operadora.*\(UND_ERR_CONNECT_TIMEOUT\)$/)
assert.match(netError(fail('ENOTFOUND'), h), /não foi encontrado \(DNS\)/)
assert.match(netError(fail('ECONNREFUSED'), h), /recusou a conexão/)
assert.match(netError(fail('CERT_HAS_EXPIRED'), h), /certificado/)
assert.match(netError(Object.assign(new Error('x'), { name: 'TimeoutError' }), h), /não respondeu.*\(TIMEOUT\)$/)
assert.match(netError(new Error('algo estranho'), h), /^Não conectou em api\.exemplo\.com\..*\(algo estranho\)$/)
console.log('netError ok')
