const chunks = [];

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const prompt = chunks.join("");
  const comment = prompt.match(/^Comment:\s*(.*)$/m)?.[1]?.trim() || "this component";
  const source = prompt.match(/^Source:\s*(.*)$/m)?.[1]?.trim();

  const reply = [
    `Demo command adapter received: "${comment}".`,
    source ? `I would inspect ${source} first.` : "I would inspect the related component first.",
    "This is a local script reply, so no files were changed.",
  ].join(" ");

  process.stdout.write(
    JSON.stringify({
      reply,
      status: "needs_review",
    }),
  );
});
