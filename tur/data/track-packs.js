/* Starter fallback for file:// use and unavailable manifests. Hosted builds
   load data/TrackPacks/Default Packs.txt instead; edit that manifest to
   choose the published packs. The fallback reuses the built-in examples. */
window.TRACKSHIFT_OFFICIAL_PACKS = [
  {format:'TrackShift Pack',version:1,id:'27ecd453-5e32-4315-924c-4bbce12de601',name:'Starter circuits',tracks:[
    {name:'Lap trial',code:window.TS2.EXAMPLES.lapTrial},
    {name:'Fence circuit',code:window.TS2.EXAMPLES.fenceDemo},
    {name:'Mixed surfaces',code:window.TS2.EXAMPLES.materialTest}
  ]}
];
