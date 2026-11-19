import { PRIORITY_LABEL, type Priority } from '../constants';
import type { IssueDto } from '../serializers';

function csvCell(value: string | number | null | undefined) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function issuesToCsv(issues: IssueDto[]) {
  const header = ['Key', 'Title', 'Status', 'Priority', 'Estimate', 'Assignees', 'Labels', 'Due', 'Cycle', 'Milestone', 'Blocked', 'Updated'];
  const lines = [header.join(',')];
  for (const issue of issues) {
    lines.push(
      [
        issue.key,
        issue.title,
        issue.statusLabel,
        PRIORITY_LABEL[issue.priority as Priority],
        issue.estimate ?? '',
        issue.assignees.map((person) => person.name).join('; '),
        issue.labels.map((label) => label.name).join('; '),
        issue.dueDate ? issue.dueDate.slice(0, 10) : '',
        issue.cycle?.name ?? '',
        issue.milestone?.name ?? '',
        issue.blocked ? 'Yes' : '',
        issue.updatedAt,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
