export function StageDrawing() {
  return (
    <svg
      className="dia-stage-drawing"
      viewBox="0 0 620 450"
      fill="none"
      role="img"
      aria-label="舞台规格示意：台口、侧幕、吊杆、中轴线及宽深高标记"
    >
      <title>舞台空间规格示意</title>
      <g stroke="currentColor" strokeWidth="0.7" opacity="0.3">
        <path d="M65 110H565M65 330H465M90 80V405M420 80V405M190 45V270M520 45V290" />
        <path d="M90 110 190 50H520L420 110M190 50V250M520 50V250" />
      </g>
      <path
        d="m80 330 110-80h340l-100 80v14H80Z"
        fill="currentColor"
        fillOpacity="0.045"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M80 330H430L530 250M430 330V344L530 264V250"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <g stroke="currentColor" strokeWidth="1.1">
        <path d="M190 250V68H520V250M160 275V85H490V274M130 299V101H460V298" />
        <path d="M175 78H505M145 96H475M115 114H445" strokeWidth="2.4" />
        <path d="M175 73V83M255 73V83M335 73V83M415 73V83M495 73V83" />
        <path
          d="M160 120H182V274H160ZM465 120H487V274H465M130 138H152V299H130ZM434 138H456V298H434"
          fill="currentColor"
          fillOpacity="0.08"
        />
        <path
          d="M166 123V270M173 123V270M471 123V270M478 123V270M136 141V295M143 141V295M440 141V294M447 141V294"
          opacity="0.4"
        />
      </g>
      <path d="M90 330V110H420V330" stroke="currentColor" strokeWidth="5" />
      <path
        d="M94 114H416V136H94ZM94 136H116V328H94ZM394 136H416V328H394Z"
        fill="currentColor"
        fillOpacity="0.92"
      />
      <path
        d="M99 140V324M105 140V324M400 140V324M407 140V324"
        stroke="var(--dia-brand-paper)"
        strokeWidth="0.65"
        opacity="0.5"
      />
      <path
        d="M255 355 355 245V55"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeDasharray="8 5 2 5"
        opacity="0.65"
      />
      <path
        d="M130 315H409M160 291H440M190 267H470"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.18"
      />
      <g stroke="currentColor" strokeWidth="0.9">
        <path d="M90 384H420M86 389l8-10M416 389l8-10M60 110V330M55 114l10-8M55 334l10-8M454 354l98-80M450 350l8 8M548 270l8 8" />
        <path
          d="M96 365V397M414 365V397M47 110H77M47 330H77M430 346l29 16M534 264l28 17"
          opacity="0.4"
        />
        <path d="M520 80h44V58M470 178h89M285 249l32-12v-14" />
      </g>
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="280" cy="248" r="4" fill="currentColor" />
        <path d="M280 254V278M280 260l-8 11M280 260l8 10M280 278l-6 18M280 278l7 18" />
      </g>
      <g fill="currentColor" className="dia-stage-drawing-labels">
        <text x="255" y="410" textAnchor="middle">
          Stage width
        </text>
        <text x="30" y="226" textAnchor="middle" transform="rotate(-90 30 226)">
          Clear height
        </text>
        <text x="520" y="344" transform="rotate(-39 520 344)">
          Depth
        </text>
        <text x="555" y="46" textAnchor="end">
          Fly bars
        </text>
        <text x="612" y="182" textAnchor="end">
          Wings
        </text>
        <text x="318" y="218" textAnchor="end">
          Performer
        </text>
        <text x="361" y="242">
          CL
        </text>
      </g>
    </svg>
  )
}
