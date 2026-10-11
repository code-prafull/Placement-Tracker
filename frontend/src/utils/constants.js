/** Shared visual tokens: memory categories, difficulties, recall ratings. */

export const MEMORY_CATEGORIES = ['Forgotten', 'Weak', 'Learning', 'Strong', 'Mastered'];

export const MEMORY_META = {
  Forgotten: { color: 'text-rose-400', bg: 'bg-rose-500/15', bar: 'bg-rose-500', ring: 'border-rose-500/40' },
  Weak: { color: 'text-orange-400', bg: 'bg-orange-500/15', bar: 'bg-orange-400', ring: 'border-orange-500/40' },
  Learning: { color: 'text-amber-300', bg: 'bg-amber-400/15', bar: 'bg-amber-400', ring: 'border-amber-400/40' },
  Strong: { color: 'text-emerald-400', bg: 'bg-emerald-500/15', bar: 'bg-emerald-400', ring: 'border-emerald-500/40' },
  Mastered: { color: 'text-cyan-300', bg: 'bg-cyan-400/15', bar: 'bg-cyan-300', ring: 'border-cyan-400/40' },
};

export function memoryCategory(strength = 50) {
  if (strength < 25) return 'Forgotten';
  if (strength < 45) return 'Weak';
  if (strength < 65) return 'Learning';
  if (strength < 85) return 'Strong';
  return 'Mastered';
}

export const DIFFICULTY_META = {
  Easy: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  Hard: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
};

export const RESULT_META = {
  forgot: { label: 'Forgot', color: 'text-rose-400 bg-rose-500/15 border-rose-500/30', value: 0 },
  hard: { label: 'Hard', color: 'text-orange-400 bg-orange-500/15 border-orange-500/30', value: 35 },
  good: { label: 'Good', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', value: 75 },
  easy: { label: 'Easy', color: 'text-cyan-300 bg-cyan-400/15 border-cyan-400/30', value: 100 },
};

export const QUEUE_TABS = [
  { key: 'due', label: 'Due Today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'recent', label: 'Recently Revised' },
  { key: 'difficult', label: 'Difficult' },
  { key: 'forgotten', label: 'Forgotten' },
];

export const ROADMAP_TOPICS = [
  'Arrays', 'Strings', 'Hashing', 'Two Pointers', 'Sliding Window', 'Binary Search',
  'Linked List', 'Stack', 'Queue', 'Heap', 'Recursion', 'Backtracking',
  'Trees', 'BST', 'Graphs', 'Greedy', 'Dynamic Programming', 'Trie',
  'Bit Manipulation', 'Intervals',
];

export const PLATFORMS = ['LeetCode', 'GeeksforGeeks', 'HackerRank', 'Codeforces', 'InterviewBit', 'Striver Sheet', 'Other'];
