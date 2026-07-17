<script lang="ts">
  import type { AlignOp, ArrangeSortKey, DistributeAxis, NormalizeMode } from '@ew/canvas-engine'

  let { onalign, ondistribute, onarrange, onnormalize }: {
    onalign: (op: AlignOp) => void
    ondistribute: (axis: DistributeAxis) => void
    onarrange: (key: ArrangeSortKey) => void
    onnormalize: (mode: NormalizeMode) => void
  } = $props()

  const sections = [
    {
      name: 'align',
      cells: [
        ['align-left', '⫷', 'Align left', () => onalign('left')],
        ['align-hcenter', '⊟', 'Align horizontal centers', () => onalign('hcenter')],
        ['align-right', '⫸', 'Align right', () => onalign('right')],
        ['align-top', '⫯', 'Align top', () => onalign('top')],
        ['align-vmiddle', '⊞', 'Align vertical middles', () => onalign('vmiddle')],
        ['align-bottom', '⫰', 'Align bottom', () => onalign('bottom')],
      ],
    },
    {
      name: 'spread',
      cells: [
        ['distribute-horizontal', '⇹', 'Distribute horizontally', () => ondistribute('horizontal')],
        ['distribute-vertical', '⇳', 'Distribute vertically', () => ondistribute('vertical')],
      ],
    },
    {
      name: 'pack',
      cells: [
        ['arrange-default', '▦', 'Compact-pack in reading order', () => onarrange('default')],
        ['arrange-name', 'Aa', 'Compact-pack by name', () => onarrange('name')],
        ['arrange-importDate', '◷', 'Compact-pack by import date', () => onarrange('importDate')],
        ['arrange-area', '◩', 'Compact-pack by size', () => onarrange('area')],
      ],
    },
    {
      name: 'equalize',
      cells: [
        ['normalize-height', '↕', 'Equalize height (median)', () => onnormalize('height')],
        ['normalize-width', '↔', 'Equalize width (median)', () => onnormalize('width')],
        ['normalize-size', '⤢', 'Equalize size (median)', () => onnormalize('size')],
        ['normalize-area', '▣', 'Equalize area (median)', () => onnormalize('area')],
      ],
    },
  ] as const
</script>

<div class="panel" data-testid="arrange-popover" role="dialog" aria-label="Arrange selection">
  <span class="tail" aria-hidden="true"></span>
  {#each sections as section (section.name)}
    <div class="section" data-testid={`arrange-section-${section.name}`}>
      <span class="name">{section.name}</span>
      <div class="cells">
        {#each section.cells as cell (cell[0])}
          <button type="button" data-testid={cell[0]} aria-label={cell[2]} title={cell[2]} onclick={cell[3]}>{cell[1]}</button>
        {/each}
      </div>
    </div>
  {/each}
  <span class="hint">2+ selected · one undo per act</span>
</div>

<style>
  .panel { position:relative; display:flex; flex-direction:column; gap:7px; width:250px; box-sizing:border-box; padding:11px 13px; background:var(--ew-surface-menu); border:1px solid var(--ew-border-panel); border-radius:7px; box-shadow:0 10px 28px var(--ew-shadow); color:var(--ew-text-muted); font-size:.72rem; }
  .tail { position:absolute; top:-5px; left:calc(50% - 5px); width:9px; height:9px; transform:rotate(45deg); background:var(--ew-surface-menu); border-left:1px solid var(--ew-border-panel); border-top:1px solid var(--ew-border-panel); }
  .section { display:grid; grid-template-columns:52px 1fr; gap:5px; align-items:start; }
  .name,.hint { font-family:var(--ew-font-editor); }
  .name { padding-top:6px; }
  .cells { display:flex; gap:5px; flex-wrap:wrap; }
  button { min-width:28px; height:28px; display:grid; place-items:center; padding:0 5px; background:var(--ew-surface-raised); border:1px solid var(--ew-border-strong); border-radius:5px; color:var(--ew-text); font:inherit; cursor:pointer; }
  button:hover { background:var(--ew-surface-control-hover); }
  button:focus-visible { outline:2px solid var(--ew-focus-ring); outline-offset:1px; }
  .hint { border-top:1px solid var(--ew-border); padding-top:6px; color:var(--ew-text-subtle); font-size:.66rem; }
</style>
