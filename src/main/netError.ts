/** Explains a failed fetch to an API host in plain Portuguese, keeping the technical code at the end. */
export function netError(e: unknown, host: string): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } }
  const code = err.cause?.code || (err.name === 'TimeoutError' ? 'TIMEOUT' : '') || err.message || 'erro desconhecido'
  const tail = ` A chave nem chegou a ser testada. (${code})`
  if (/ENOTFOUND|EAI_AGAIN/.test(code))
    return `O endereço ${host} não foi encontrado (DNS). Confira se digitou certo.${tail}`
  if (/CONNECT_TIMEOUT|ETIMEDOUT|TIMEOUT|EHOSTUNREACH|ENETUNREACH/.test(code))
    return `O servidor ${host} não respondeu. Pode ser bloqueio da sua operadora ou o serviço fora do ar. Teste com o WARP/VPN ligado ou em outra rede (ex.: hotspot do celular).${tail}`
  if (/ECONNREFUSED/.test(code)) return `O servidor ${host} recusou a conexão. Confira o endereço e a porta.${tail}`
  if (/ECONNRESET|UND_ERR_SOCKET/.test(code))
    return `A conexão com ${host} caiu no meio. Pode ser bloqueio na rede ou instabilidade do serviço; tente de novo.${tail}`
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code))
    return `O certificado de segurança de ${host} não é válido. Confira se o endereço começa com https:// e está certo.${tail}`
  return `Não conectou em ${host}.${tail}`
}
