---
name: ai-update-docs
description:
  This prompt is used to update the documentation files (CHANGELOG.md, README.md, CLAUDE.md) based on the code changes made in the latest
  commit.
model: Claude Opus 4.6 (copilot)
---

If any of these files do not exist, please create them with the relevant sections and content based on the existing code base. If they do
exist, update them with the new information as follows:

1. We've now changed the code base with the modifications mentioned in this message. Update the CHANGELOG.md to be consistent with the code
   changes we've made at a level of detail appropriate to the change log.

2. Update the readme.md with any new features we added and provide instructions on how to configure the config.json file correctly to get
   the features to work, if applicable. If necessary, include a short section right at the bottom titled Troubleshooting and include some
   reasons and solutions for why the features may seem not to work, if no such instructions already exisit in the readme.

3. Update the CLAUDE.md file with the important information that you would need in order to maintain, update and improve the code base in
   future updates and changes. Consider the information that would be most useful to you right now with regards to the code we've added to
   this version, if I were to ask you to add a new feature or fix a bug. Keep context window pressure in mind, so keep it concise.
