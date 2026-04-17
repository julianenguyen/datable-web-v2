export const WHEEL_OF_LIFE = {
  love_relationships: {
    label: 'Love & Relationships',
    subcategories: ['Partner', 'Ex-partner', 'Dating prospect', 'Spouse'],
  },
  friends_social: {
    label: 'Friends & Social',
    subcategories: ['Close friend', 'Friend group', 'Acquaintance', 'Social event', 'Community/contact'],
  },
  family_home: {
    label: 'Family & Home',
    subcategories: ['Parent', 'Sibling', 'Child', 'Extended family member', 'Roommate', 'Household environment'],
  },
  career_business: {
    label: 'Career & Business',
    subcategories: ['Manager', 'Coworker', 'Direct report', 'Client', 'Interview/job search', 'Workplace situation'],
  },
  finance: {
    label: 'Finance',
    subcategories: ['Income', 'Spending', 'Debt', 'Bills', 'Savings', 'Financial stressor', 'Financial win'],
  },
  health_fitness: {
    label: 'Health & Fitness',
    subcategories: ['Sleep', 'Exercise', 'Nutrition', 'Illness', 'Medication', 'Energy', 'Body symptoms'],
  },
  personal_growth: {
    label: 'Personal Growth',
    subcategories: ['Self-worth', 'Mindset', 'Spiritual practice', 'Learning', 'Goals', 'Habits', 'Identity work'],
  },
  fun_recreation: {
    label: 'Fun & Recreation',
    subcategories: ['Hobby', 'Travel', 'Social outing', 'Rest', 'Creativity', 'Entertainment', 'Celebration'],
  },
} as const

export type WheelCategory = keyof typeof WHEEL_OF_LIFE
