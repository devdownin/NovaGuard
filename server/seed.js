/* Initial panel contents, used when there is no persisted state yet. */
const MINUTE = 60000;

export function seed(now = Date.now()) {
  return {
    property: 'Rue Lafayette',
    mode: 'off',
    status: 'disarmed',
    countdown: 0,
    sensors: [
      { id: 's1', name: 'Front Door',    zone: 'Entry',     type: 'contact', state: 'closed', battery: 92 },
      { id: 's2', name: 'Garage Door',   zone: 'Perimeter', type: 'contact', state: 'closed', battery: 74 },
      { id: 's3', name: 'Back Window',   zone: 'Perimeter', type: 'contact', state: 'closed', battery: 12 },
      { id: 's4', name: 'Living Room',   zone: 'Interior',  type: 'motion',  state: 'clear',  battery: 88 },
      { id: 's5', name: 'Hallway',       zone: 'Interior',  type: 'motion',  state: 'clear',  battery: 61 },
      { id: 's6', name: 'Kitchen Smoke', zone: 'Safety',    type: 'smoke',   state: 'clear',  battery: 97 }
    ],
    cameras: [
      { id: 'c1', name: 'Front Porch', status: 'live',    lastMotion: now - 6 * MINUTE },
      { id: 'c2', name: 'Driveway',    status: 'live',    lastMotion: now - 41 * MINUTE },
      { id: 'c3', name: 'Back Garden', status: 'live',    lastMotion: now - 3 * 60 * MINUTE },
      { id: 'c4', name: 'Garage',      status: 'offline', lastMotion: now - 26 * 60 * MINUTE }
    ],
    events: [
      { id: 'e1', kind: 'motion',  text: 'Motion on Front Porch',         at: now - 6 * MINUTE },
      { id: 'e2', kind: 'system',  text: 'System disarmed by Chloé',      at: now - 52 * MINUTE },
      { id: 'e3', kind: 'battery', text: 'Back Window battery low (12%)', at: now - 4 * 60 * MINUTE },
      { id: 'e4', kind: 'system',  text: 'Armed — Away',                  at: now - 9 * 60 * MINUTE },
      { id: 'e5', kind: 'motion',  text: 'Motion on Driveway',            at: now - 11 * 60 * MINUTE }
    ]
  };
}
