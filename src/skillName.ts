export interface ParsedSkillName {
  plugin: string | null;
  skill: string;
}

export function parseSkillName(rawSkillName: string): ParsedSkillName {
  const colonIndex = rawSkillName.indexOf(':');
  if (colonIndex === -1) {
    return { plugin: null, skill: rawSkillName };
  }
  return {
    plugin: rawSkillName.slice(0, colonIndex),
    skill: rawSkillName.slice(colonIndex + 1),
  };
}
