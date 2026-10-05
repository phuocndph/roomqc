export type ChangeType = 'new' | 'improved' | 'fixed' | 'removed';

export interface ChangelogChange {
  type: ChangeType;
  text: string;
}

export interface ChangelogEntry {
  version: string;
  releaseDate: string;
  title?: string;
  changes: ChangelogChange[];
}

export interface ChangelogFile {
  current: string;
  versions: ChangelogEntry[];
}

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  new: 'Mới',
  improved: 'Cải tiến',
  fixed: 'Sửa lỗi',
  removed: 'Đã gỡ',
};
