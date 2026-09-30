function cleanLine(line) {
  const withoutBom = line.replace(/^\uFEFF/, '');
  const hash = withoutBom.indexOf('#');
  return (hash >= 0 ? withoutBom.slice(0, hash) : withoutBom).trim();
}

function splitDirective(line) {
  const index = line.indexOf(':');
  if (index < 0) return null;
  return {
    key: line.slice(0, index).trim().toLowerCase(),
    value: line.slice(index + 1).trim()
  };
}

function finalizeGroup(groups, current) {
  if (!current || !current.user_agents.length) return null;
  groups.push({
    user_agents: [...new Set(current.user_agents)],
    rules: current.rules,
    crawl_delay: current.crawl_delay
  });
  return null;
}

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let seenRule = false;

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const directive = splitDirective(line);
    if (!directive) continue;
    const { key, value } = directive;

    if (key === 'sitemap') {
      if (value && !sitemaps.includes(value)) sitemaps.push(value);
      continue;
    }

    if (key === 'user-agent') {
      if (!value) continue;
      if (!current || seenRule) {
        current = finalizeGroup(groups, current);
        current = { user_agents: [], rules: [], crawl_delay: null };
        seenRule = false;
      }
      current.user_agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;

    if (key === 'allow' || key === 'disallow') {
      current.rules.push({ directive: key, pattern: value });
      seenRule = true;
    } else if (key === 'crawl-delay') {
      const number = Number(value);
      current.crawl_delay = Number.isFinite(number) ? number : value;
      seenRule = true;
    }
  }

  finalizeGroup(groups, current);
  return { groups, sitemaps };
}

function userAgentSpecificity(group, userAgent) {
  const ua = userAgent.toLowerCase();
  let best = -1;
  for (const token of group.user_agents) {
    const normalized = token.toLowerCase();
    if (normalized === '*') best = Math.max(best, 0);
    else if (ua.includes(normalized)) best = Math.max(best, normalized.length);
  }
  return best;
}

function compilePattern(pattern) {
  if (pattern === '') return null;
  const anchored = pattern.endsWith('$');
  const core = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = core
    .replace(/[.+?^{}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp('^' + escaped + (anchored ? '$' : ''));
}

function patternSpecificity(pattern) {
  return pattern.replace(/\*/g, '').replace(/\$$/, '').length;
}

function pathFromInput(input, origin) {
  const value = String(input ?? '/').trim() || '/';
  try {
    const parsed = new URL(value, origin);
    return parsed.pathname + parsed.search;
  } catch {
    return value.startsWith('/') ? value : '/' + value;
  }
}

export function evaluatePolicy(parsed, userAgent, pathInput, origin) {
  const groups = parsed.groups ?? [];
  let bestSpecificity = -1;
  const selected = [];

  for (const group of groups) {
    const specificity = userAgentSpecificity(group, userAgent);
    if (specificity < 0) continue;
    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      selected.length = 0;
      selected.push(group);
    } else if (specificity === bestSpecificity) {
      selected.push(group);
    }
  }

  const path = pathFromInput(pathInput, origin);
  if (!selected.length) {
    return { user_agent: userAgent, path, allowed: true, matched_rule: null, match_length: 0, group_specificity: -1 };
  }

  let winner = null;
  for (const group of selected) {
    for (const rule of group.rules ?? []) {
      if (!rule.pattern) continue;
      const regex = compilePattern(rule.pattern);
      if (!regex || !regex.test(path)) continue;
      const specificity = patternSpecificity(rule.pattern);
      const allowed = rule.directive === 'allow';
      if (
        !winner ||
        specificity > winner.specificity ||
        (specificity === winner.specificity && allowed && !winner.allowed)
      ) {
        winner = { rule, specificity, allowed };
      }
    }
  }

  return {
    user_agent: userAgent,
    path,
    allowed: winner ? winner.allowed : true,
    matched_rule: winner ? winner.rule : null,
    match_length: winner ? winner.specificity : 0,
    group_specificity: bestSpecificity
  };
}

export function evaluateMatrix(parsed, userAgents, paths, origin) {
  const decisions = [];
  for (const userAgent of userAgents) {
    for (const path of paths) decisions.push(evaluatePolicy(parsed, userAgent, path, origin));
  }
  return decisions;
}
