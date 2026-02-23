"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Clock, XCircle, Globe, Mail, User, ShieldCheck } from "lucide-react";

export type LeadStatus = "searching" | "crawling" | "verified" | "failed" | "general";

export interface Lead {
    id: string;
    name: string;
    website: string;
    initialEmail: string | null;
    ownerName: string | null;
    verifiedEmail: string | null;
    status: LeadStatus;
}

interface ResultsTableProps {
    leads: Lead[];
}

const statusConfig = {
    searching: { icon: Clock, color: "text-zinc-500", bg: "bg-zinc-500/10", label: "Zoeken..." },
    crawling: { icon: Clock, color: "text-blue-400", bg: "bg-blue-400/10", label: "Crawlen..." },
    verified: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10", label: "Geverifieerd" },
    general: { icon: ShieldCheck, color: "text-amber-400", bg: "bg-amber-400/10", label: "Algemeen" },
    failed: { icon: XCircle, color: "text-red-400", bg: "bg-red-400/10", label: "Mislukt" },
};

export function ResultsTable({ leads }: ResultsTableProps) {
    if (leads.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-6xl mt-8 md:mt-12"
        >
            {/* Mobile View: Cards */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
                {leads.map((lead, idx) => {
                    const StatusIcon = statusConfig[lead.status].icon;
                    return (
                        <motion.div
                            key={lead.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3, delay: idx * 0.1 }}
                            className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 backdrop-blur-sm shadow-xl"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-medium text-zinc-200 text-base">{lead.name}</h3>
                                    <div className="flex items-center text-xs text-zinc-500 mt-1">
                                        <Globe className="w-3 h-3 mr-1" />
                                        <span className="truncate max-w-[200px]">{lead.website}</span>
                                    </div>
                                </div>
                                <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[lead.status].bg} ${statusConfig[lead.status].color}`}>
                                    <StatusIcon className={`w-3.5 h-3.5 mr-1.5 ${lead.status === 'searching' || lead.status === 'crawling' ? 'animate-spin' : ''}`} />
                                    {statusConfig[lead.status].label}
                                </span>
                            </div>

                            <div className="flex flex-col gap-2 mt-2 pt-3 border-t border-zinc-800/50 bg-zinc-950/30 -mx-4 -mb-4 p-4 rounded-b-xl">
                                <div className="flex items-center text-sm">
                                    <Mail className="w-4 h-4 mr-3 text-zinc-500 shrink-0" />
                                    {lead.initialEmail ? (
                                        <span className="text-zinc-300 truncate">{lead.initialEmail}</span>
                                    ) : (
                                        <span className="text-zinc-600 italic">
                                            {lead.status === 'failed' ? 'Mislukt/Timeout' : 'Zoeken...'}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center text-sm">
                                    <User className="w-4 h-4 mr-3 text-zinc-500 shrink-0" />
                                    {lead.ownerName ? (
                                        <span className="text-zinc-200">{lead.ownerName}</span>
                                    ) : (
                                        <span className="text-zinc-600 italic">
                                            {lead.status === 'searching' || lead.status === 'crawling' ? 'Zoeken...' : 'Geen naam'}
                                        </span>
                                    )}
                                </div>
                                {lead.verifiedEmail && (
                                    <div className="mt-2 text-sm bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-3 py-2 rounded-lg flex items-center">
                                        <CheckCircle2 className="w-4 h-4 mr-2 shrink-0" />
                                        <span className="truncate">{lead.verifiedEmail}</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Desktop View: Table */}
            <div className="hidden md:block bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-x-auto backdrop-blur-sm">
                <table className="w-full text-left text-sm text-zinc-400 min-w-[900px]">
                    <thead className="text-xs uppercase bg-zinc-800/50 text-zinc-300 border-b border-zinc-800">
                        <tr>
                            <th className="px-6 py-4 font-medium w-[25%]">Bedrijf</th>
                            <th className="px-6 py-4 font-medium w-[25%]">Website Mailadres</th>
                            <th className="px-6 py-4 font-medium w-[20%]">Contactpersoon</th>
                            <th className="px-6 py-4 font-medium w-[20%]">Geverifieerd Adres</th>
                            <th className="px-6 py-4 font-medium text-right w-[10%]">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leads.map((lead, idx) => {
                            const StatusIcon = statusConfig[lead.status].icon;

                            return (
                                <motion.tr
                                    key={lead.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.3, delay: idx * 0.1 }}
                                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                                >
                                    <td className="px-6 py-4 max-w-[200px]">
                                        <div className="font-medium text-zinc-200 truncate">{lead.name}</div>
                                        <div className="flex items-center text-xs text-zinc-500 mt-1">
                                            <Globe className="w-3 h-3 mr-1 shrink-0" />
                                            <span className="truncate">{lead.website}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 max-w-[200px]">
                                        {lead.initialEmail ? (
                                            <div className="flex items-center text-zinc-300">
                                                <Mail className="w-3 h-3 mr-2 text-zinc-500 shrink-0" />
                                                <span className="truncate">{lead.initialEmail}</span>
                                            </div>
                                        ) : (
                                            <span className="text-zinc-600 italic">
                                                {lead.status === 'failed' ? 'Mislukt/Timeout' : 'Zoeken...'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 max-w-[150px]">
                                        {lead.ownerName ? (
                                            <div className="flex items-center text-zinc-200">
                                                <User className="w-3 h-3 mr-2 text-zinc-500 shrink-0" />
                                                <span className="truncate">{lead.ownerName}</span>
                                            </div>
                                        ) : (
                                            <span className="text-zinc-600 italic">
                                                {lead.status === 'searching' || lead.status === 'crawling' ? 'Zoeken...' : 'Geen naam'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 max-w-[150px]">
                                        {lead.verifiedEmail ? (
                                            <div className="font-mono text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-300 inline-block max-w-full truncate">
                                                {lead.verifiedEmail}
                                            </div>
                                        ) : (
                                            <span className="text-zinc-600 italic">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 flex justify-end">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[lead.status].bg} ${statusConfig[lead.status].color}`}>
                                            <StatusIcon className={`w-3.5 h-3.5 mr-1.5 shrink-0 ${lead.status === 'searching' || lead.status === 'crawling' ? 'animate-spin' : ''}`} />
                                            <span className="whitespace-nowrap">{statusConfig[lead.status].label}</span>
                                        </span>
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
}
