"use client";

import { useState } from "react";
import { Search, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export function SearchBar({ onSearch }: { onSearch?: (query: string) => void }) {
    const [query, setQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setIsSearching(true);
        if (onSearch) {
            onSearch(query);
        }

        // Simulate finishing search phase
        setTimeout(() => {
            setIsSearching(false);
        }, 2000);
    };

    return (
        <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            onSubmit={handleSearch}
            className="w-full max-w-2xl relative group"
        >
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 opacity-20 group-hover:opacity-40 blur transition duration-500"></div>
            <div className="relative flex items-center bg-zinc-900 border border-zinc-800 rounded-full shadow-2xl overflow-hidden focus-within:border-zinc-700 transition-colors pl-4 pr-1.5 py-1.5 md:pl-6 md:pr-2 md:py-2">
                <div className="text-zinc-400 shrink-0">
                    <Search className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Zoek horeca leads..."
                    className="w-full px-3 md:px-4 py-2.5 md:py-3 bg-transparent border-none outline-none text-zinc-100 placeholder:text-zinc-500 text-base md:text-lg"
                />
                <div>
                    <button
                        type="submit"
                        disabled={!query.trim() || isSearching}
                        className="flex items-center justify-center w-12 h-12 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 transition-all disabled:cursor-not-allowed group-focus-within:bg-indigo-500 group-focus-within:text-white group-focus-within:hover:bg-indigo-600"
                    >
                        {isSearching ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <ArrowRight className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </div>
        </motion.form>
    );
}
