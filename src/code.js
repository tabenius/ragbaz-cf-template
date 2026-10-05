// Dependency-free syntax highlighting for code shown on project websites.
//
// Server-side and deterministic: the same source always renders the same
// spans, with no client JavaScript, no third-party highlighter and no network
// fetch. Output is escaped first and wrapped second, so hostile source text
// can never break out of its spans. An unknown language renders escaped and
// unadorned rather than failing the page.
//
// Supported languages are the ones project content actually uses: shell
// (quickstart commands), python (scripted experiments) and JSON (record and
// projection examples). Shell heredocs whose marker names a Python block are
// highlighted as Python; anything else inside a heredoc stays plain.

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const CODE_LANGUAGES = Object.freeze(['shell', 'python', 'json']);

// Each rule is [pattern-source, class]. Rules are tried in order at every
// position; the first match wins, otherwise one character passes through
// plain. Patterns must match a prefix of the remaining input.
const COMMENT = String.raw`#[^\n]*`;
const DQ_STRING = String.raw`"(?:[^"\\\n]|\\.)*"`;
const SQ_STRING = String.raw`'(?:[^'\\\n]|\\.)*'`;
const NUMBER = String.raw`(?:(?<![\w$.])(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?))`;
const FLAG = String.raw`(?:(?<!\S)(?:--[a-zA-Z0-9][\w-]*|-[a-zA-Z0-9]+))`;
const SHELL_KEYWORDS = String.raw`(?:\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|in|select|until|time)\b)`;
const PY_KEYWORDS = String.raw`(?:\b(?:import|from|def|return|assert|if|elif|else|for|while|with|as|None|True|False|class|raise|try|except|finally|lambda|pass|yield|await|async|in|is|not|and|or)\b)`;
const PY_TRIPLE = String.raw`(?:'''[\s\S]*?'''|"""[\s\S]*?""")`;

const SHELL_RULES = Object.freeze([
  [COMMENT, 'tok-com'],
  [`(?:${DQ_STRING}|${SQ_STRING})`, 'tok-str'],
  [SHELL_KEYWORDS, 'tok-kw'],
  [NUMBER, 'tok-num'],
  [String.raw`(?:^[$›»])`, 'tok-prompt'],
  [FLAG, 'tok-flag'],
]);

const PYTHON_RULES = Object.freeze([
  [COMMENT, 'tok-com'],
  [`(?:${PY_TRIPLE}|${DQ_STRING}|${SQ_STRING})`, 'tok-str'],
  [PY_KEYWORDS, 'tok-kw'],
  [NUMBER, 'tok-num'],
  [String.raw`(?:@[a-zA-Z_]\w*)`, 'tok-ann'],
]);

const JSON_RULES = Object.freeze([
  [String.raw`(?://[^\n]*)`, 'tok-com'],
  [`(?:"(?:[^"\\\\]|\\\\.)*")(?=\\s*:)`, 'tok-key'],
  [`(?:"(?:[^"\\\\]|\\\\.)*")`, 'tok-str'],
  [String.raw`(?:\b(?:true|false|null)\b)`, 'tok-kw'],
  [String.raw`(?:(?<![\w$."-])-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)`, 'tok-num'],
]);

function tokenize(source, rules) {
  const pats = rules.map(([pattern, cls]) => [new RegExp(pattern, 'ys'), cls]);
  const out = [];
  let pos = 0;
  while (pos < source.length) {
    let matched = false;
    for (const [pattern, cls] of pats) {
      pattern.lastIndex = pos;
      const match = pattern.exec(source);
      if (match && match.index === pos && match[0].length) {
        out.push(`<span class="${cls}">${esc(match[0])}</span>`);
        pos += match[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(esc(source[pos]));
      pos += 1;
    }
  }
  return out.join('');
}

const PY_MARKER = /^(PY|PYTHON)$/i;

function highlightShell(source) {
  // Heredoc bodies are content, not shell. A Python-named marker earns Python
  // highlighting; any other marker stays plain so an unknown payload cannot
  // be misread as code in either language.
  const blocks = [];
  let body = [], marker = null;
  const flushBody = () => {
    if (!body.length) return;
    const text = body.join('\n');
    blocks.push(marker && PY_MARKER.test(marker) ? tokenize(text, PYTHON_RULES) : esc(text));
    body = [];
  };
  for (const line of source.split('\n')) {
    if (marker) {
      if (line.trim() === marker) {
        flushBody();
        blocks.push(esc(line));
        marker = null;
      } else body.push(line);
      continue;
    }
    const opened = line.match(/<<-?\s*'?([A-Za-z_][A-Za-z0-9_]*)'?/);
    blocks.push(tokenize(line, SHELL_RULES));
    if (opened) marker = opened[1];
  }
  flushBody();
  return blocks.join('\n');
}

export function highlightCode(source, language = 'shell') {
  if (typeof source !== 'string') throw new Error('Code must be a string');
  if (language === 'shell') return highlightShell(source);
  if (language === 'python') return tokenize(source, PYTHON_RULES);
  if (language === 'json') return tokenize(source, JSON_RULES);
  return esc(source);
}
