import { pollPercentage, type PollOption, type PollResults as Results } from "../../lib/polls";

export function PollResults({ options, results, multiple, selected = [], admin = false }: { options: PollOption[]; results: Results; multiple: boolean; selected?: string[]; admin?: boolean }) {
  return <div className="mt-4">
    <ul aria-label="Poll results" className="space-y-3">
      {options.map((option) => {
        const count = results.options.find((row) => row.key === option.key)?.count ?? 0;
        const percentage = pollPercentage(count, results.responses);
        return <li key={option.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 break-words">{option.text}{selected.includes(option.key) ? <span className="ml-1 text-xs text-[#355f9e]"> · your choice</span> : null}</span><span className="shrink-0 tabular-nums text-[#355f9e]">{admin ? `${count} · ` : ""}{percentage}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#355f9e]/8"><div className="h-full rounded-full bg-[#355f9e]/55 transition-[width] motion-reduce:transition-none" style={{ width: `${percentage}%` }} /></div>
        </li>;
      })}
    </ul>
    <p className="mt-4 text-xs text-[#202523]/65">{results.responses} {admin ? "" : "highly scientific "}{results.responses === 1 ? "response" : "responses"}</p>
    {multiple ? <p className="mt-1 text-xs leading-5 text-[#202523]/55">Percent of respondents choosing each option. With multiple choices, totals can exceed 100%.</p> : null}
  </div>;
}
