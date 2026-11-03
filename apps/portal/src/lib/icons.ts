/**
 * Central Solar icon map — all icons used across the portal.
 * Style guide: use `bold` for nav/action icons, `linear` for inline/subtle icons.
 * Full icon list: https://icon-sets.iconify.design/solar/
 */
export const Icons = {
  // Navigation
  dashboard:    'solar:widget-bold',
  courses:      'solar:notebook-bookmark-bold',
  live:         'solar:videocamera-record-bold',
  assignments:  'solar:document-text-bold',
  mentorship:   'solar:users-group-rounded-bold',
  certificates: 'solar:medal-ribbons-star-bold',
  community:    'solar:chat-round-bold',
  wallet:       'solar:wallet-money-bold',
  reports:      'solar:chart-2-bold',
  settings:     'solar:settings-bold',
  logout:       'solar:logout-3-bold',
  countries:    'solar:global-bold',
  payouts:      'solar:transfer-horizontal-bold',
  packages:     'solar:box-bold',

  // Actions
  search:       'solar:magnifer-linear',
  bell:         'solar:bell-linear',
  arrowRight:   'solar:arrow-right-bold',
  arrowLeft:    'solar:alt-arrow-left-linear',
  chevronRight: 'solar:alt-arrow-right-linear',
  chevronDown:  'solar:alt-arrow-down-linear',
  sort:         'solar:sort-from-top-to-bottom-bold',
  check:        'solar:check-circle-bold',
  close:        'solar:close-circle-bold',
  download:     'solar:download-bold',
  upload:       'solar:upload-bold',
  externalLink: 'solar:arrow-right-up-bold',
  eye:          'solar:eye-bold',
  eyeOff:       'solar:eye-closed-bold',
  add:          'solar:add-circle-bold',
  edit:         'solar:pen-new-square-bold',
  trash:        'solar:trash-bin-minimalistic-bold',

  // Auth / User
  mail:         'solar:letter-bold',
  lock:         'solar:lock-password-bold',
  user:         'solar:user-rounded-bold',
  phone:        'solar:phone-bold',
  graduate:     'solar:diploma-bold',
  shield:       'solar:shield-check-bold',

  // Navigation — extra
  roadmap:      'solar:routing-bold',
  alert:        'solar:bell-bing-bold',
  messages:     'solar:chat-dots-bold',

  // Content
  play:         'solar:play-bold',
  pause:        'solar:pause-bold',
  volume:       'solar:volume-loud-linear',
  volumeOff:    'solar:volume-cross-linear',
  fullscreen:   'solar:full-screen-linear',
  clock:        'solar:clock-circle-bold',
  calendar:     'solar:calendar-bold',
  tag:          'solar:tag-bold',
  hash:         'solar:hashtag-bold',
  card:         'solar:card-bold',
  dollar:       'solar:dollar-minimalistic-bold',
  trending:     'solar:graph-up-bold',
  wifi:         'solar:wifi-bold',
  star:         'solar:star-bold',
  spinner:      'solar:refresh-bold',
  file:         'solar:document-bold',
  notebook:     'solar:notebook-bold',
  income:       'solar:hand-money-bold',
  student:      'solar:square-academic-cap-bold',
  teacher:      'solar:user-speak-rounded-bold',
  school:       'solar:buildings-2-bold',
  question:     'solar:question-square-bold',
  monitor:      'solar:monitor-bold',
  refresh:      'solar:refresh-circle-bold',
  grid:         'solar:widget-2-bold',
  list:         'solar:list-bold',
  heart:        'solar:heart-bold',
  image:        'solar:gallery-bold',

  // Social / profile
  linkedin:    'solar:linkedin-bold',
  globe:       'solar:global-bold',
  location:    'solar:map-point-bold',
  badge:       'solar:medal-ribbons-star-bold',

  // Linear — panels & inline elements
  downloadLine: 'solar:download-minimalistic-linear',
  clockLine:    'solar:clock-circle-linear',
  trashLine:    'solar:trash-bin-minimalistic-linear',
  copy:         'solar:copy-bold',
  copyLine:     'solar:copy-linear',
  checkLine:    'solar:check-read-linear',
  send:         'solar:plain-2-linear',
  sparkles:     'solar:star-shine-linear',
  docLine:      'solar:document-text-linear',
  penLine:      'solar:pen-2-linear',
  closeSmall:   'solar:close-square-linear',
  listLine:     'solar:list-linear',
  boldLine:      'solar:text-bold-linear',
  chevronDown2:  'solar:alt-arrow-down-linear',
  keyLine:       'solar:key-minimalistic-linear',
  questionLine:  'solar:question-circle-linear',
  lightbulbLine: 'solar:lightbulb-minimalistic-linear',
  sunLine:       'solar:sun-linear',
  moonLine:      'solar:moon-stars-linear',
} as const;

export type IconName = keyof typeof Icons;
