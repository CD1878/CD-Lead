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
            <div className="relative flex items-center bg-zinc-900 border border-zinc-800 rounded-full shadow-2xl overflow-hidden focus-within:border-zinc-700 transition-colors pl-6 pr-2 py-2">
                <div className="text-zinc-400">
                    <Search className="w-6 h-6" />
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Bijv. Italiaanse restaurants in Amsterdam..."
                    className="w-full px-4 py-3 bg-transparent border-none outline-none text-zinc-100 placeholder:text-zinc-500 text-lg"
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
