const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: { type: string; text: string }[];
  fields?: { type: string; text: string }[];
}

async function sendSlackDM(
  slackUserId: string,
  blocks: SlackBlock[],
  text: string
): Promise<string | null> {
  if (!SLACK_TOKEN) {
    console.log(`[Slack stub] Would DM ${slackUserId}: ${text}`);
    return null;
  }

  // Open a DM conversation
  const openRes = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: slackUserId }),
  });
  const openData = await openRes.json();
  if (!openData.ok) {
    console.error("Slack conversations.open failed:", openData.error);
    return null;
  }

  // Send message
  const msgRes = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: openData.channel.id,
      text,
      blocks,
    }),
  });
  const msgData = await msgRes.json();
  if (!msgData.ok) {
    console.error("Slack chat.postMessage failed:", msgData.error);
    return null;
  }

  return msgData.ts;
}

export async function notifyPass(
  slackUserId: string,
  branch: string,
  prNumber: number
): Promise<string | null> {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "CI Passed", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Branch:*\n\`${branch}\`` },
        {
          type: "mrkdwn",
          text: `*PR:*\n<https://github.com/${process.env.GITHUB_ORG}/${process.env.GITHUB_REPO}/pull/${prNumber}|#${prNumber}>`,
        },
      ],
    },
  ];

  return sendSlackDM(slackUserId, blocks, `CI passed on ${branch}`);
}

export async function notifyFlakyRerun(
  slackUserId: string,
  branch: string,
  prNumber: number,
  reasoning: string,
  rerunCount: number,
  maxReruns: number
): Promise<string | null> {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Flaky Failure Detected — Re-running CI",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Branch:*\n\`${branch}\`` },
        {
          type: "mrkdwn",
          text: `*PR:*\n<https://github.com/${process.env.GITHUB_ORG}/${process.env.GITHUB_REPO}/pull/${prNumber}|#${prNumber}>`,
        },
        {
          type: "mrkdwn",
          text: `*Rerun:*\n${rerunCount}/${maxReruns}`,
        },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Analysis:*\n${reasoning}` },
    },
  ];

  return sendSlackDM(
    slackUserId,
    blocks,
    `Flaky failure on ${branch} — re-running CI (${rerunCount}/${maxReruns})`
  );
}

export async function notifyLegitimateFailure(
  slackUserId: string,
  branch: string,
  prNumber: number,
  reasoning: string
): Promise<string | null> {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "CI Failed — Appears Related to Your Changes",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Branch:*\n\`${branch}\`` },
        {
          type: "mrkdwn",
          text: `*PR:*\n<https://github.com/${process.env.GITHUB_ORG}/${process.env.GITHUB_REPO}/pull/${prNumber}|#${prNumber}>`,
        },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Analysis:*\n${reasoning}` },
    },
  ];

  return sendSlackDM(
    slackUserId,
    blocks,
    `CI failed on ${branch} — failure appears related to your changes`
  );
}
