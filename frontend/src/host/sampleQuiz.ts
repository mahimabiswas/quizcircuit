// A built-in quiz, used until hosts can create their own.

import type { CreateRoomRequest } from '../protocol'

export const SAMPLE_QUIZ: CreateRoomRequest = {
  time_limit: 20,
  questions: [
    {
      text: 'Which of these is an example of eventual consistency?',
      options: [
        'A DNS update spreading across the world',
        'A transaction inside a single SQL database',
        'A bank transfer within one ledger',
        'A write to a CPU register',
      ],
      correct: 0,
    },
    {
      text: 'In leader-based replication, every write is first handled by the leader.',
      options: ['True', 'False'],
      correct: 0,
    },
    {
      text: 'What does a vector clock track?',
      options: ['Wall-clock time', 'Causal ordering of events', 'Disk usage', 'Message size'],
      correct: 1,
    },
    {
      text: 'According to the CAP theorem, what must a system give up during a network partition?',
      options: [
        'Either consistency or availability',
        'Partition tolerance',
        'Durability',
        'Low latency',
      ],
      correct: 0,
    },
  ],
}
