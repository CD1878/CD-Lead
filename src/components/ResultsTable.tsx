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
            className="w-full max-w-6xl mt-12 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-sm"
        >
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-400">
                    <thead className="text-xs uppercase bg-zinc-800/50 text-zinc-300 border-b border-zinc-800">
                        <tr>
                            <th className="px-6 py-4 font-medium">Bedrijf</th>
                            <th className="px-6 py-4 font-medium">Website Mailadres</th>
                            <th className="px-6 py-4 font-medium">Contactpersoon</th>
                            <th className="px-6 py-4 font-medium">Geverifieerd Adres</th>
                            <th className="px-6 py-4 font-medium text-right">Status</th>
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
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-zinc-200">{lead.name}</div>
                                        <div className="flex items-center text-xs text-zinc-500 mt-1">
                                            <Globe className="w-3 h-3 mr-1" />
                                            {lead.website}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {lead.initialEmail ? (
                                            <div className="flex items-center text-zinc-300">
                                                <Mail className="w-3 h-3 mr-2 text-zinc-500" />
                                                {lead.initialEmail}
                                            </div>
                                        ) : (
                                            <span className="text-zinc-600 italic">Zoeken...</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {lead.ownerName ? (
                                            <div className="flex items-center text-zinc-200">
                                                <User className="w-3 h-3 mr-2 text-zinc-500" />
                                                {lead.ownerName}
                                            </div>
                                        ) : (
                                            <span className="text-zinc-600 italic">Geen naam</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {lead.verifiedEmail ? (
                                            <div className="font-mono text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-300 inline-block">
                                                {lead.verifiedEmail}
                                            </div>
                                        ) : (
                                            <span className="text-zinc-600 italic">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[lead.status].bg} ${statusConfig[lead.status].color}`}>
                                            <StatusIcon className={`w-3.5 h-3.5 mr-1.5 ${lead.status === 'searching' || lead.status === 'crawling' ? 'animate-spin' : ''}`} />
                                            {statusConfig[lead.status].label}
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
