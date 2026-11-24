---
description: Kick off work on a Jira card, save the story to ./stories, create a working branch, and hand off to /spdd-analysis
argument-hint: <jira-card-key, e.g. LATC-2>
allowed-tools: AskUserQuestion, Bash, Write, mcp__jira__getJiraIssue, mcp__jira__editJiraIssue, mcp__jira__createJiraIssue, mcp__jira__transitionJiraIssue, mcp__jira__atlassianUserInfo, mcp__jira__addOrEditJiraIssueComment
---

# Kickoff

Start work on the Jira card `$ARGUMENTS`. If no card key was given, use AskUserQuestion to ask for one (format `LATC-<number>`).

## Hard rule

**NEVER edit, change, or move the original card.** The original card is read-only for every step below, with one narrow exception in step 3b (a comment, only after the user confirms).

## 1. Read the card

Use `getJiraIssue` to read the card: key, title, description, status, and anything else relevant. Present a short summary to the user. Do not analyse requirements or break down acceptance criteria here; that is the job of `/spdd-analysis`.

## 2. Check the status

Look at the card's current status.

### 3a. Not in "In Development": work on a copy

1. Get the user's name with `atlassianUserInfo` (or AskUserQuestion if it is not available).
2. Make a **copy** of the original card with `createJiraIssue` (same project, issue type, description, and relevant fields) with the title:
   `<user name> - <original title>`
3. Use `transitionJiraIssue` to move the **copy** (not the original) to **In Development**.
4. Tell the user the copy's key. The branch name and story file still use the **original** card's key (see steps 4 and 5).

### 3b. Already in "In Development": comment instead

Do not create a copy. Show the user the comment you intend to leave (a short note that the user is starting an attempt on this card), and use AskUserQuestion to confirm it. Only after they confirm, add the comment with `addOrEditJiraIssueComment`. This is the only write allowed on the original card, and it must not change any field, status, or assignee.

If the user declines, skip the comment and continue.

## 4. Save the story

Save the card content as a markdown file in `./stories` (create the directory with Bash if it does not exist):

- Filename: `<original-card-key-lowercase>-<desc>.md`, for example `latc-2-show-seats-remaining.md`.
- Contents: original key (and the copy's key, if one was made), title, status, link to the card, and the description exactly as written on the card.

## 5. Create the branch

1. Build the branch name `latc-{id}-{desc}`:
   - `{id}` is the numeric part of the **original** card's key (`LATC-2` gives `2`), **always**, even when a copied card was created. Never use the copy's key.
   - `{desc}` is a short kebab-case description from the title: lowercase, letters, numbers and hyphens only, at most about 5 words.
   - Example: `latc-2-show-seats-remaining`
2. Run `git status` first. If there are uncommitted changes that would be affected, tell the user and ask how to proceed.
3. Run `git checkout -b <branch-name>` (via Bash).

## 6. Hand off to /spdd-analysis

Report the branch name, the story file path, and, if a copy was made, the copy's key. Then tell the user to continue with `/spdd-analysis @<story-file-path>`, and **stop**. Do not analyse requirements, start implementing, commit, or push.
