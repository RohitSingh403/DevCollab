# DevCollab

DevCollab is a multi-user workspace for software teams. A workspace has members, projects, and numbered issues. People assign work, comment, mention teammates, follow issues, and mark blockers. The overview reads live counts from MongoDB. Updates and the inbox travel over Socket.IO.

It is a team system with shared data, roles, and authorization. It is not a personal timer or habit tracker.

## Preview

A new account opens on a starter workspace that already has a project, a board, and activity. The seeded team below is a second workspace, Northwind Labs, with two projects (`API` and `WEB`), blockers, a follower, and a markdown comment.

Sign in as `maya@devcollab.dev` / `Password123!`. Jonah Patel (`jonah@devcollab.dev`) is an admin and Priya Nair (`priya@devcollab.dev`) is a member. The same password works for all three. These accounts are demo data, not production credentials.

![Public home with the product preview and a path into sign-in](docs/screenshots/home.png)

![Workspace overview with open, overdue, and done counts](docs/screenshots/overview.png)

![My work grouped into overdue and due this week](docs/screenshots/my-work.png)

![Project board filtered by a saved view](docs/screenshots/board.png)

![API Platform filtered to Cycle 12](docs/screenshots/cycle.png)

![Cycle 12 with point totals on each issue](docs/screenshots/estimates.png)

![API-1 after a move to Web Client, now WEB-3, with the same checklist and comments](docs/screenshots/move.png)

![Session cookie issue with three sub-issues, one of them done](docs/screenshots/sub-issues.png)

![API-8, a backlog copy of the session issue with a fresh checklist](docs/screenshots/duplicate.png)

![WEB-2 related to API-5, separate from the blocker](docs/screenshots/related.png)

![API-8 filed from the Bug template, with an unchecked checklist](docs/screenshots/template.png)

![API Platform filtered to the feature label and sorted by priority](docs/screenshots/label-sort.png)

![API Platform after the feature label was renamed to product](docs/screenshots/labels.png)

![Issue detail with status, priority, assignees, and comments](docs/screenshots/issue.png)

![A checklist with two of four steps done](docs/screenshots/checklist.png)

![An issue blocked by another issue in the workspace](docs/screenshots/blockers.png)

![Jonah following an issue from the watchers panel](docs/screenshots/watchers.png)

![Favorites in the sidebar for API Platform and API-1](docs/screenshots/favorites.png)

![Command menu finding an issue by its key](docs/screenshots/command-menu.png)

![A comment with bold text, a list, and a link](docs/screenshots/comment-markdown.png)

![Issue description with a bold bullet and a link](docs/screenshots/description.png)

![Members with owner, admin, and member roles](docs/screenshots/members.png)

![Web Client archived, with API Platform still active](docs/screenshots/archive.png)

## Features

Accounts and access:

- Email and password accounts, bcrypt hashing, and an httpOnly JWT cookie. Account settings can change the password after checking the current one
- Workspaces with owner, admin, and member roles
- Email invites for people who already have an account, and one-time links for everyone else
- A starter workspace on signup, so the first session is not an empty board

Work:

- Projects with short keys (`API-12`) and per-project issue numbers. An owner or admin can rename a project, rewrite its description, or choose a color. The key stays the same, so existing issue numbers do not change. The color shows on the project list, the overview, and favorites
- Archive a finished project. It leaves My work and the workspace totals, and comes back when an owner or admin restores it
- Issues with status, priority, labels, assignees, due dates, comments, and history
- Rename or recolor a label. Issues and templates keep it, and the board shows the new name and color
- A board you can drag between columns, plus a list view
- Filters, text search, and pagination. The board can also filter by label, by who is assigned, or by issues with nobody assigned, and sort by updated, newest, due date, or priority. A saved view keeps that choice
- Export the current project view as CSV. The file uses the filters on the board, up to 1,000 issues, in the same order as the list
- Bulk edit on the list. Select issues on the page and set their status, priority, assignee, due date, cycle, or milestone together. Choosing no assignee clears the people on those issues. Choosing no due date clears the date. Choosing no cycle or no milestone removes that link. Each issue keeps its own history, and an archived project stays closed
- Saved project views, private or shared. A view assigned to “me” follows whoever opens it
- My work, the open issues assigned to you: overdue, due this week, due later, and no due date. Snooze an issue until a later day to hide it from your list. The snooze is private, and the issue comes back on that day
- Workload. Open issues in active projects, counted for each person they are assigned to. A shared issue counts for everyone on it. The overview shows the counts, and the workload page lists the issues, with overdue ones first
- Blockers inside one workspace. The issue, the board, and My work show the mark while a blocker is open, and clear it when that blocker is done
- A checklist on an issue. Steps can be renamed, checked, and removed, and the board, list, and My work show how many are done
- Cycles. A project has one active cycle, with a start and end date. The board can show just that cycle, My work names it, and the project totals include how much of it is done. The active cycle can be renamed, given new dates, or given a point budget, and its issues stay on it. The bar shows the points on the cycle against that budget. Ending the cycle leaves open issues on it. Starting the next cycle while one is still active moves those open issues forward
- Active cycles. The overview lists the active cycle on each open project. A cycle over its point budget is listed first, and that line is marked. Finished cycles and archived projects stay off the list
- Milestones. A project can name up to 20 targets, each with an optional date. An issue belongs to one milestone, the board can show just that milestone, and the progress counts how many of its issues are done. The name and date can be changed later, and the issues stay on it
- A roadmap for the workspace. It lists milestones from active projects, with overdue targets first, then upcoming dates, undated targets, and finished ones. The overview shows the next few
- Needs an owner. The overview lists open issues in active projects that have no assignee, highest priority first. The project board can show just those issues
- Needs an estimate. The overview lists open issues in active projects with no point estimate, highest priority first. The project board can show just those issues, and a saved view can keep that choice. Setting an estimate removes the issue from the list
- Coming due. The overview lists open issues in active projects that are overdue or due within seven days, soonest first. The project board can show just those issues, and a saved view can keep that choice
- Blocked. The overview lists open issues in active projects that are still blocked, with the open blocker on each row. The mark clears when every blocker is done. The project board can show just those issues, and a saved view can keep that choice
- Gone quiet. The overview lists open issues in active projects with no update for seven days, oldest first. A comment counts as an update. The project board can show just those issues, and a saved view can keep that choice
- Estimates of 1, 2, 3, 5, or 8 points. The cycle bar adds those up, and the board, list, and My work show the number on each issue
- Move an issue to another project in the same workspace. It keeps its discussion, checklist, and estimate, takes the next key in the destination, and leaves its cycle
- Sub-issues in the same workspace. A parent shows how many direct children are done, on the issue, the board, the list, and My work
- Duplicate an issue. The copy keeps the title, description, labels, priority, estimate, and checklist steps, starts in the backlog, and leaves comments and blockers behind
- Related issues. Link two issues in the same workspace without making one a blocker or a sub-issue. The link shows on both, and deleting either issue removes it
- Issue templates. A project can keep a starting title, description, priority, estimate, labels, and checklist. A new issue can begin from one, and the author or an admin can delete it
- Due reminders. Assignees get one inbox alert on the day an open issue is due, and one more after that day passes. Changing the date or reopening the issue allows a new alert
- Inbox preferences. Each person can turn off assignments, comments, mentions, status changes, blockers, or due reminders. The choice stays with that person. Alerts already in the inbox stay there
- A command menu, opened with Ctrl K or ⌘K, that jumps to a page, a project, or an issue key
- Favorites. Pin up to 12 projects and issues in a workspace. They stay in the sidebar for that person only
- Recent issues. Opening an issue keeps it in the sidebar and the command menu for that person, newest first, up to eight. Opening it again moves it to the top

Discussion:

- @mentions in comments, which notify that person in their inbox and over the live connection
- Reactions on a comment. A member can add or remove thumbs up, eyes, celebrate, check, or heart. The count is shared, and each person is counted once. Reactions do not send an inbox alert
- A pinned comment. Any member can pin one comment on an issue. It moves to the top, and pinning another comment replaces it
- Comment and description markdown for bold, lists, and links. An issue key such as `API-12` links to that issue when it is in the same workspace. The rules are in the next section
- Watchers. Any member can follow an issue and get the comment, status, and blocker alerts that the reporter and assignees already get

Workspace:

- Workspace and project analytics: open work, overdue issues, completions this week, status mix, and 14 days of activity
- Workspace activity can be limited to one project, and to issues, comments, blockers, cycles, milestones, or membership changes. A row opens the issue it describes, or the project when the change was not about one issue
- Real-time issue, comment, view, and notification events for other members
- API integration tests, authorization tests, and a frontend suite

## Writing

A comment and an issue description are stored as text. The browser renders a small subset and never inserts that text as HTML. The description has Write and Preview while you edit.

| You write | What people see |
| --- | --- |
| `**Secure**` or `__Secure__` | Bold text |
| A line starting with `- ` or `* ` | A bullet |
| A line starting with `1. ` | A numbered item |
| `[the guide](https://example.com)` | A link that opens in a new tab |
| `API-12` | A link to that issue, when it is in this workspace |

Only `http` and `https` addresses become links. HTML, `javascript:` URLs, and other markup stay as text. `@Priya Nair` still mentions a workspace member, including inside bold text or a link label. An unknown `@name` is left as text. An issue key is two to six letters or digits, a hyphen, and a number, and it is not part of a longer word. `API-12` inside a link label stays in that link. A key with no matching issue, including one from another workspace, stays as text.

## Architecture

```mermaid
flowchart LR
  subgraph browser [Browser]
    UI[React + TanStack Query]
  end
  subgraph api [Express]
    REST[REST routes]
    Auth[JWT cookie + role checks]
    IO[Socket.IO]
  end
  DB[(MongoDB)]
  UI -->|HTTPS cookie| REST
  UI <-->|workspace rooms| IO
  REST --> Auth
  REST --> DB
  IO --> DB
```

| Layer | Choice |
| --- | --- |
| UI | React, TypeScript, Tailwind, React Router |
| Client state | Zustand for the session and toasts, TanStack Query for server data |
| API | Node.js, Express, Zod validation |
| Data | MongoDB, Mongoose, aggregation for analytics |
| Auth | bcrypt, JWT in an httpOnly cookie, role checks on every workspace resource |
| Live updates | Socket.IO rooms per workspace and per user |
| Tests | Vitest, Supertest, React Testing Library, mongodb-memory-server |

```
client/     React application
server/     Express API, Socket.IO, Mongoose models
```

The production server can also serve `client/dist`, so cookies stay on one origin. Split hosting is supported with `VITE_API_URL` and `CLIENT_ORIGIN`.

## Roles

| Action | Owner | Admin | Member |
| --- | --- | --- | --- |
| View workspace, file issues, comment | Yes | Yes | Yes |
| Invite members, edit workspace settings | Yes | Yes | No |
| Invite or promote admins and owners | Yes | No | No |
| Delete a project | Yes | Yes | No |
| Delete the workspace | Yes | No | No |
| Delete someone else's issue or comment | Yes | Yes | No |

A workspace always keeps at least one owner. Someone who is not a member gets a 404 for that workspace, project, or issue, so private ids are not confirmed. A member who lacks the role gets a 403.

Passwords are hashed with bcrypt (12 rounds in production, fewer in tests). The session cookie is `HttpOnly`. `SameSite=Lax` is the default, which blocks cross-site form posts. Cross-site deployments (Vercel frontend, API on another host) need `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true`. Invite tokens are stored as SHA-256 hashes and shown once.

## Local setup

Requirements: Node.js 20 or newer. MongoDB is optional for development.

```bash
npm install
npm --prefix server install
npm --prefix client install
cp server/.env.example server/.env
```

Use a real database:

```bash
# server/.env
MONGODB_URI=mongodb://127.0.0.1:27017/devcollab
```

Or an in-memory database that lives only as long as the API process:

```bash
# server/.env
MONGODB_URI=memory
SEED=true
```

Start both apps:

```bash
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:4000/api/health

With `SEED=true`, the Northwind accounts from the preview are available alongside the starter workspace created for any new registration.

To seed a persistent database instead:

```bash
npm run seed
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API with reload, and the Vite client |
| `npm test` | Server tests, then client tests |
| `npm run build` | Production client bundle and compiled API |
| `npm start` | Runs the compiled API |
| `npm run seed` | Inserts the Northwind demo workspace |
| `npm --prefix server run loadtest` | 100 concurrent health checks, prints latency |

## API

Authenticated routes expect the session cookie. Collection responses are paginated as `{ page, limit, total, pages }` where a list is involved. Errors look like `{ error: { message, code, details } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Start a session |
| POST | `/api/auth/logout` | Clear the cookie |
| GET, PATCH | `/api/auth/me` | Current user, or rename |
| GET, POST | `/api/workspaces` | List or create |
| GET, PATCH, DELETE | `/api/workspaces/:id` | Read, update, or delete |
| GET | `/api/workspaces/:id/members` | Members |
| POST | `/api/workspaces/:id/invites` | Add a user or mint an invite link |
| POST | `/api/invites/:token/accept` | Accept an invite |
| GET, POST | `/api/workspaces/:id/projects` | Projects in a workspace |
| GET | `/api/workspaces/:id/roadmap` | Milestones on active projects, with progress and a date group |
| GET | `/api/workspaces/:id/unassigned` | Open issues in active projects with no assignee |
| GET | `/api/workspaces/:id/unestimated` | Open issues in active projects with no point estimate |
| GET | `/api/workspaces/:id/cycles` | Active cycles on open projects, with point totals. A cycle over its budget is first |
| GET | `/api/workspaces/:id/due` | Open issues in active projects that are overdue or due within seven days. `days` can be 1–30 |
| GET | `/api/workspaces/:id/blocked` | Open issues in active projects that are still blocked by an open issue |
| GET | `/api/workspaces/:id/quiet` | Open issues in active projects with no update for seven days. `days` can be 1–30 |
| GET, PATCH, DELETE | `/api/projects/:id` | Read, update, or delete a project. An update can change the name, the description, the color, or whether it is archived. The key stays the same |
| GET, POST | `/api/projects/:id/issues` | Filtered, paginated issues. `assignee=me` means the signed-in user |
| GET | `/api/projects/:id/issues/export` | CSV of that same view, up to 1,000 issues. The file is named with the project key |
| GET | `/api/issues/:id` | One issue, including blockers and whether you follow it |
| PATCH, DELETE | `/api/issues/:id` | Update or delete an issue |
| POST, DELETE | `/api/issues/:id/snooze` | Hide an open issue from your My work until a future date, or bring it back |
| POST | `/api/issues/bulk` | Set the status, priority, assignee, due date, cycle, or milestone of up to 25 issues in one workspace. A null assignee clears the people. A null due date clears the date. A null cycle or milestone removes that link |
| POST | `/api/issues/:id/blockers` | Block this issue on another issue in the same workspace |
| DELETE | `/api/issues/:id/blockers/:blockerId` | Remove that blocker |
| POST, DELETE | `/api/issues/:id/watch` | Follow or unfollow an issue |
| POST | `/api/issues/:id/checklist` | Add a step. An issue holds at most 30 |
| PATCH | `/api/issues/:id/checklist/:itemId` | Rename a step or mark it done |
| DELETE | `/api/issues/:id/checklist/:itemId` | Remove a step |
| GET, POST | `/api/issues/:id/comments` | Discussion. The body is plain text; the client renders the markdown subset |
| PATCH, DELETE | `/api/comments/:id` | Edit your comment, or delete it when you are the author or an admin |
| POST | `/api/comments/:id/pin` | Pin or unpin a comment. An issue keeps one pinned comment |
| POST | `/api/comments/:id/reactions` | Add or remove your reaction. `emoji` is `+1`, `eyes`, `tada`, `check`, or `heart` |
| GET, POST, DELETE | `/api/projects/:id/views` | Saved filters for a project. Private views stay with their author; shared views are visible to the project |
| GET | `/api/workspaces/:id/my-work` | Open issues assigned to the signed-in user |
| GET, POST | `/api/workspaces/:id/recent` | Issues this person opened in the workspace, newest first, up to eight. Posting an issue id records the visit |
| GET | `/api/workspaces/:id/workload` | Open issues in active projects, grouped by assignee. A shared issue counts for each person |
| GET | `/api/workspaces/:id/search?q=` | Issues by title, or by key such as `API-12` |
| POST | `/api/workspaces/:id/issue-keys` | Resolve up to 40 issue keys in that workspace. Unknown keys are omitted |
| GET, POST, DELETE | `/api/workspaces/:id/labels` | Workspace labels. Deleting one requires an admin |
| GET | `/api/workspaces/:id/activity` | Workspace history. `project` limits it to one project in that workspace. `kind` is `issues`, `comments`, `blockers`, `cycles`, `milestones`, or `members` |
| GET | `/api/projects/:id/activity` | Project history |
| GET | `/api/issues/:id/activity` | Issue history |
| GET | `/api/workspaces/:id/analytics` | Workspace totals |
| GET | `/api/projects/:id/analytics` | Project totals, including the active cycle when there is one |
| GET, POST | `/api/projects/:id/cycles` | List cycles, or start one. `capacity` is an optional point budget from 1 to 200. Open issues from the active cycle move into the new one |
| POST | `/api/projects/:id/cycles/end` | End the active cycle. Open issues stay on it |
| PATCH | `/api/projects/:id/cycles/:cycleId` | Rename the active cycle, change its dates, or set its point budget. Null clears the budget. Issues stay on it. A finished cycle cannot be edited |
| GET, POST | `/api/projects/:id/milestones` | List milestones with done and total counts, or add one |
| PATCH, DELETE | `/api/projects/:id/milestones/:milestoneId` | Rename a milestone, change its date, or remove it. Removing it clears the issues that used it |
| GET | `/api/notifications` | Inbox |
| GET, PATCH | `/api/notifications/preferences` | Your inbox choices. Every kind starts on. A patch turns one or more kinds on or off |
| POST | `/api/notifications/read-all` | Mark the inbox read |
| PATCH | `/api/notifications/:id/read` | Mark one notification read |
| GET | `/api/health` | Process and database status |

Issue list filters: `status`, `priority`, `assignee`, `label`, `q`, `overdue`, `quiet`, `dueSoon`, `blocked`, `cycle` (`active` or a cycle id), `page`, `limit`, `sort` (`updated`, `created`, `due`, `priority`). Setting `cycleId` on an issue update adds or removes it from a cycle in the same project. `quiet=true` keeps open issues whose last update is at least seven days old. `dueSoon=true` keeps open issues that are overdue or due within seven days. `blocked=true` keeps open issues that are still blocked.

The API checks due dates when the process starts and then every hour. A date is due today through the end of that UTC day, and overdue after it. Assignees are notified once for each.

Socket.IO authenticates with the same cookie. Clients emit `workspace:join` with a workspace id. The server checks membership before joining `workspace:{id}`. Each connection also joins `user:{id}` for notifications. Events: `issue:created`, `issue:updated`, `issue:deleted`, `comment:created`, `comment:updated`, `comment:deleted`, `view:saved`, `view:deleted`, `cycle:started`, `cycle:updated`, `cycle:ended`, `project:updated`, `activity:created`, `notification:created`.

## Tests

Server tests cover registration, cookie sessions, duplicate emails, role boundaries, invite links, issue numbers, filters, pagination, comments, mentions, saved views, My work, snoozing an issue, unassigned issues, blockers, watchers, checklists, due reminders, cycles, ending a cycle, editing the active cycle, a point budget on a cycle, active cycles, milestones, editing a milestone, renaming a project, recoloring a project, filtering workspace activity by project and by kind, quiet issues, issues coming due, blocked issues, issues with no estimate, workload by assignee, the workspace roadmap, estimates, moving an issue between projects, sub-issues, bulk status, priority, assignee, due date, cycle, and milestone edits, comment reactions, pinned comments, notifications, inbox preferences, exporting a project view, analytics, recently opened issues, and a Socket.IO broadcast. Client tests cover formatting, mentions, the command menu, comment markdown, issue keys, checklist progress, saved-view filters, and the login form. The server boots MongoDB in memory, so the suite does not need a local database.

```bash
npm test
```

## Deployment

### Docker

```bash
docker compose up --build
```

The app is served at http://localhost:4000 with MongoDB 7. Seed it from another terminal only if you point `MONGODB_URI` at `mongodb://127.0.0.1:27017/devcollab` and run `npm run seed` on the host, or set `SEED=true` on the app service for the first boot.

### Render and MongoDB Atlas

`render.yaml` builds the client and the API, then starts one web service. Create an Atlas cluster, set `MONGODB_URI`, and set `CLIENT_ORIGIN` to the service's public `https://` URL. The health check is `/api/health`.

Atlas network access must allow the Render service. The filesystem is ephemeral, so uploads are not part of this app. Data lives in MongoDB.

### Split hosting

Build the client with `VITE_API_URL=https://your-api.example.com` and deploy `client/` to Vercel (`client/vercel.json` rewrites SPA routes). On the API set:

```
CLIENT_ORIGIN=https://your-app.vercel.app
COOKIE_SECURE=true
COOKIE_SAMESITE=none
```

## Data notes

- Issue numbers increment on the project document, so concurrent creates do not reuse a number. Renaming a project changes the name only. The key and the issue numbers stay where they are. A project color is one of eight values. A new project takes a color from its key until someone chooses one. Choosing the color it already has does not add another history row.
- Workspace activity includes every project until a project id is sent. That id has to belong to the workspace. Membership changes stay on the full list because they are not tied to a project. `kind` keeps one group of changes: issues, comments, blockers, cycles, milestones, or members. A membership change stays off the issue and comment lists.

- `completedAt` is set when an issue moves to Done and cleared if it is reopened. "Done this week" uses that field.
- `commentCount` is stored on the issue and updated when comments are added or removed.
- `blocked` stays true while any linked blocker is still open. Adding, removing, completing, reopening, or deleting a blocker updates it.
- Followers are stored on the issue. Removing someone from the workspace also removes their follows. The reporter and assignees are notified without having to follow.
- Checklist steps are stored on the issue in the order they were added. Checking a step does not change the issue status. The activity log records adds, checks, renames, and removals.
- A project has one active cycle. Starting another completes the previous one and moves open issues forward. Ending the active cycle leaves those issues where they are, so the next cycle starts empty. An issue keeps its cycle when that cycle ends. Editing the active cycle changes its name, dates, or point budget and leaves every issue where it is. The budget is 1 to 200 points, and null clears it. The same budget does not add another history row. The end date is today or later. A finished cycle stays as it was. The workspace list keeps the active cycle on each open project. Finished cycles and archived projects stay off it. Points include every issue on the cycle. A cycle is over budget when those points are above its budget, and those cycles are listed first. A cycle with no budget stays in date order.

- An estimate is optional. The cycle point total ignores issues that have none, and points on a finished issue count as done.
- The roadmap skips archived projects. A milestone is overdue when its date is before today and an issue on it is still open. It is done when it has issues and every one of them is done. Renaming a milestone or moving its date leaves the issues on it, and the roadmap uses the new date.
- A snooze belongs to one person and one issue. It hides that issue from their My work until the chosen day, then it returns. Other members still see the issue.
- A recent issue belongs to one person and one workspace. Opening it again moves it to the top. The list keeps eight. Deleting the issue removes it. Other members keep their own list.
- Unassigned means the issue has no assignees. Finished issues and archived projects stay off the workspace list. The project filter still includes finished issues when you ask for nobody assigned.
- Unestimated means an open issue has no point estimate. Finished issues and archived projects stay off the workspace list. Setting an estimate removes the issue from the list. The project filter still includes finished issues when you ask for no estimate.
- Quiet means an open issue has not changed for the chosen number of days, seven unless the request says otherwise. Finished issues and archived projects stay off the workspace list. A comment moves the issue out of the list.
- Coming due means an open issue is overdue or its date falls within the chosen number of days, seven unless the request says otherwise. Finished issues, issues with no date, and archived projects stay off the workspace list. The soonest date is first.
- Blocked means an open issue still has an open blocker. Finished issues and archived projects stay off the workspace list. Finishing every blocker removes the issue from the list.
- Workload counts open issues in active projects for each member they are assigned to. Finished issues and archived projects stay out. An issue with two assignees counts once for each of them. Overdue issues are listed first. Each person shows at most eight issues, and the open count is the full number.
- A bulk assignee replaces the people on each selected issue. Sending null removes them. Status and priority are unchanged unless they are sent too. A bulk due date sets the same day on each selected issue, or clears it when the date is null. A date that is already set is left as it is. A bulk cycle or milestone must belong to each issue's project. Sending null removes that link. A cycle or milestone that is already set is left as it is.
- Moving an issue gives it the next number in the destination project. The old number is not reused. Comments move with it. A cycle does not, because a cycle belongs to one project.
- A sub-issue has one parent in the same workspace. Nesting stops at eight levels. Deleting a parent leaves its sub-issues in place, without a parent. The count on a card is its direct children.
- Due reminders are stored on the issue as the date and kind already sent, so the hourly check does not repeat them. Turning reminders off still marks that day as sent, so turning them back on does not replay it.
- Inbox preferences belong to one person. Assignments, comments, mentions, status changes, blockers, and due reminders each start on. Turning one off stops new alerts of that kind. Alerts already in the inbox stay there. Another member keeps their own choices.
- Comment markdown is not stored as HTML. The client parses a fixed subset and renders React elements.
- Analytics use aggregation pipelines. Day buckets are UTC.
- List endpoints are paginated. The board requests up to 100 issues and says when the filter still has more.
- A project export uses the same filters as the issue list and keeps the same order. It includes at most 1,000 issues. A cell is quoted when it contains a comma, a quote, or a line break. A value that starts with `=`, `+`, `-`, or `@` is prefixed so a spreadsheet keeps it as text. An archived project can still be exported.

## License

This project is sample application code for a portfolio. Add a license before you reuse it in a product.
