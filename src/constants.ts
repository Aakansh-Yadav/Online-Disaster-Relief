export const POST_CATEGORIES = [
  'Shelter',
  'Medicine',
  'Food',
  'Water',
  'Transport',
  'Other',
] as const

export type PostCategory = (typeof POST_CATEGORIES)[number]
