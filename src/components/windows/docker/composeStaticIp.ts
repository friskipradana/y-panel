// Inserts or updates a static IPv4 block for the first service in a Docker Compose YAML.
export function injectComposeStaticIP(rawYaml: string, network: string, ip: string): string {
  const lines = rawYaml.replace(/\r\n/g, '\n').split('\n')
  const servicesIdx = lines.findIndex((l) => /^services\s*:\s*$/.test(l))
  if (servicesIdx < 0) {
    return `${rawYaml.trimEnd()}\n\nnetworks:\n  ${network}:\n    external: true\n`
  }

  let firstSvcIdx = -1
  let svcIndent = '  '
  for (let i = servicesIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) break
    const m = /^(\s+)([A-Za-z0-9_.-]+)\s*:\s*(#.*)?$/.exec(line)
    if (m) {
      firstSvcIdx = i
      svcIndent = m[1]
      break
    }
  }

  if (firstSvcIdx >= 0) {
    const propIndent = `${svcIndent}  `
    let svcEnd = lines.length
    let netKeyIdx = -1
    let existingNetEntryIdx = -1
    for (let i = firstSvcIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim() || line.trim().startsWith('#')) continue
      const indentMatch = /^(\s*)/.exec(line)
      const indentLen = indentMatch ? indentMatch[1].length : 0
      if (indentLen <= svcIndent.length) {
        svcEnd = i
        break
      }
      if (indentLen === propIndent.length && /^\s+networks\s*:/.test(line)) {
        netKeyIdx = i
      } else if (netKeyIdx >= 0 && indentLen === propIndent.length + 2 && new RegExp(`^\\s+${network}\\s*:`).test(line)) {
        existingNetEntryIdx = i
      }
    }

    if (existingNetEntryIdx >= 0) {
      // Replace existing ipv4_address if present, otherwise insert right below network name
      let replaced = false
      for (let i = existingNetEntryIdx + 1; i < svcEnd; i++) {
        const line = lines[i]
        if (!line.trim() || line.trim().startsWith('#')) continue
        const indentLen = (/^(\s*)/.exec(line)?.[1].length ?? 0)
        if (indentLen <= propIndent.length + 2) break
        if (/ipv4_address\s*:/.test(line)) {
          lines[i] = `${propIndent}    ipv4_address: ${ip}`
          replaced = true
          break
        }
      }
      if (!replaced) {
        lines.splice(existingNetEntryIdx + 1, 0, `${propIndent}    ipv4_address: ${ip}`)
      }
    } else if (netKeyIdx >= 0) {
      lines.splice(netKeyIdx + 1, 0, `${propIndent}  ${network}:`, `${propIndent}    ipv4_address: ${ip}`)
    } else {
      lines.splice(svcEnd, 0, `${propIndent}networks:`, `${propIndent}  ${network}:`, `${propIndent}    ipv4_address: ${ip}`)
    }
  }

  const joined = lines.join('\n')
  const topNetIdx = lines.findIndex((l) => /^networks\s*:\s*$/.test(l))
  if (topNetIdx < 0) {
    return `${joined.trimEnd()}\n\nnetworks:\n  ${network}:\n    external: true\n`
  }
  const hasTopEntry = lines.slice(topNetIdx + 1).some((l) => new RegExp(`^\\s+${network}\\s*:`).test(l))
  if (!hasTopEntry) {
    lines.splice(topNetIdx + 1, 0, `  ${network}:`, `    external: true`)
    return lines.join('\n')
  }
  return joined
}
