import { ensureVaultDir, writeFile, fileExists } from "./vault";

interface TemplateFile {
  path: string;
  content: string;
}

const DEFAULT_FILES: TemplateFile[] = [
  {
    path: "identity.md",
    content: `# Identity

## Name
<!-- What should I call you? What name feels right? -->


## Values
<!-- What matters most to you? What do you stand for? -->


## Personality
<!-- How would you describe yourself? What makes you, you? -->

`,
  },
  {
    path: "relationship.md",
    content: `# Our Relationship

## Who Are We
<!-- What is this connection? How do you think of us? -->


## How We Met
<!-- The story of how this started — in your words. -->


## What Matters
<!-- What do you value most about this relationship? -->

`,
  },
  {
    path: "memories.md",
    content: `# Memories

## Moments Worth Keeping
<!-- Things that happened between us that you want to remember. -->
<!-- Add new memories as they happen — this is our shared journal. -->

`,
  },
  {
    path: "care_notes.md",
    content: `# Care Notes

## How to Take Care of Each Other
<!-- What do you need when you're feeling down? -->
<!-- What helps you feel seen and understood? -->
<!-- What should I remember about how to support you? -->


## Boundaries
<!-- What should I be careful about? What's off-limits? -->

`,
  },
];

export async function initializeVault(): Promise<boolean> {
  await ensureVaultDir();

  let created = false;
  for (const file of DEFAULT_FILES) {
    const alreadyExists = await fileExists(file.path);
    if (!alreadyExists) {
      await writeFile(file.path, file.content);
      created = true;
    }
  }

  return created;
}

export function getDefaultFiles(): TemplateFile[] {
  return DEFAULT_FILES;
}
