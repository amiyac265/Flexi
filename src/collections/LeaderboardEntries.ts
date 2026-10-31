import type { CollectionConfig } from 'payload'

const isPayloadAdmin = ({ req }: { req: { user?: { collection?: string } | null } }) =>
  req.user?.collection === 'admins'

export const LeaderboardEntries: CollectionConfig = {
  slug: 'leaderboard-entries',
  admin: {
    group: 'Flexi',
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'points', 'workouts', 'streak'],
  },
  access: {
    read: () => true,
    create: isPayloadAdmin,
    update: isPayloadAdmin,
    delete: isPayloadAdmin,
  },
  fields: [
    { name: 'displayName', type: 'text', required: true },
    { name: 'handle', type: 'text', required: true, unique: true, index: true },
    { name: 'points', type: 'number', required: true, min: 0, defaultValue: 0 },
    { name: 'workouts', type: 'number', required: true, min: 0, defaultValue: 0 },
    { name: 'streak', type: 'number', required: true, min: 0, defaultValue: 0 },
    {
      name: 'avatar',
      type: 'select',
      required: true,
      options: ['bunny', 'panda', 'turtle', 'deer'],
    },
  ],
}
