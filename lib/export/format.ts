export type ExportTopicBundle = {
  topic: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    current_view: string;
    created_at: string;
    updated_at?: string;
  };
  content: Array<{
    id: string;
    title: string | null;
    body: string;
    source_url: string | null;
    summary: string | null;
    content_type: string;
    created_at: string;
  }>;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
    metadata?: unknown;
  }>;
  experiments: Array<{
    id: string;
    name: string;
    hypothesis: string | null;
    status: string;
    created_at: string;
  }>;
  conflict_choices?: Array<{
    id: string;
    prompt: string;
    choice_a: string;
    choice_b: string;
    selected: string | null;
    rationale: string | null;
    created_at: string;
  }>;
};

export type ExportAllBundle = {
  exported_at: string;
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    goals: string[];
    constraints: string;
    proactivity_frequency: string;
    onboarding_completed: boolean;
    ori_name: string;
    persona_tone: string;
    persona_custom_tone: string;
    persona_guide_note: string;
    created_at: string;
    updated_at: string;
  };
  topics: ExportTopicBundle[];
};

export function topicToMarkdown(bundle: ExportTopicBundle): string {
  const lines: string[] = [
    `# ${bundle.topic.title}`,
    "",
    `- Status: ${bundle.topic.status}`,
    `- Created: ${bundle.topic.created_at}`,
    "",
    "## Current view",
    "",
    bundle.topic.current_view.trim() || "_No current view._",
    "",
  ];

  if (bundle.topic.description) {
    lines.splice(5, 0, "## Description", "", bundle.topic.description, "");
  }

  lines.push("## Content", "");
  if (bundle.content.length === 0) {
    lines.push("_No content._", "");
  } else {
    for (const item of bundle.content) {
      lines.push(`### ${item.title || "Untitled"}`);
      lines.push("");
      lines.push(`- Type: ${item.content_type}`);
      if (item.source_url) lines.push(`- URL: ${item.source_url}`);
      if (item.summary) {
        lines.push("", item.summary, "");
      } else if (item.body) {
        lines.push("", item.body.slice(0, 2000), "");
      }
    }
  }

  lines.push("## Messages", "");
  if (bundle.messages.length === 0) {
    lines.push("_No messages._", "");
  } else {
    for (const message of bundle.messages) {
      lines.push(`### ${message.role} · ${message.created_at}`, "", message.content, "");
    }
  }

  lines.push("## Experiments", "");
  if (bundle.experiments.length === 0) {
    lines.push("_No experiments._", "");
  } else {
    for (const experiment of bundle.experiments) {
      lines.push(`### ${experiment.name}`);
      lines.push("");
      lines.push(`- Status: ${experiment.status}`);
      if (experiment.hypothesis) {
        lines.push("", experiment.hypothesis, "");
      } else {
        lines.push("");
      }
    }
  }

  if (bundle.conflict_choices && bundle.conflict_choices.length > 0) {
    lines.push("## Conflict choices", "");
    for (const choice of bundle.conflict_choices) {
      lines.push(`### ${choice.prompt}`);
      lines.push("");
      lines.push(`- A: ${choice.choice_a}`);
      lines.push(`- B: ${choice.choice_b}`);
      if (choice.selected) lines.push(`- Selected: ${choice.selected}`);
      if (choice.rationale) lines.push("", choice.rationale, "");
      else lines.push("");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export function allDataToMarkdown(bundle: ExportAllBundle): string {
  const lines: string[] = [
    "# Ori data export",
    "",
    `Exported at: ${bundle.exported_at}`,
    "",
    "## Profile",
    "",
    `- Email: ${bundle.profile.email ?? ""}`,
    `- Name: ${bundle.profile.full_name ?? ""}`,
    `- Proactivity: ${bundle.profile.proactivity_frequency}`,
    `- Coach name: ${bundle.profile.ori_name}`,
    `- Persona tone: ${bundle.profile.persona_tone}`,
    bundle.profile.persona_custom_tone
      ? `- Custom tone: ${bundle.profile.persona_custom_tone}`
      : null,
    bundle.profile.persona_guide_note
      ? `- Guide note: ${bundle.profile.persona_guide_note}`
      : null,
    "",
    "### Goals",
    "",
  ].filter((line): line is string => line !== null);

  if (bundle.profile.goals.length === 0) {
    lines.push("_No goals._", "");
  } else {
    for (const goal of bundle.profile.goals) {
      lines.push(`- ${goal}`);
    }
    lines.push("");
  }

  lines.push("### Constraints", "", bundle.profile.constraints || "_None._", "", "---", "");

  for (const topic of bundle.topics) {
    lines.push(topicToMarkdown(topic).trim(), "", "---", "");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function slugifyFilename(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "export"
  );
}
