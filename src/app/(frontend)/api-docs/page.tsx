import type { Metadata } from 'next'
import APIExplorer from './APIExplorer'
export const metadata: Metadata = { title: 'Flexi API docs', robots: { index: false, follow: false } }
export default function APIDocsPage() { return <APIExplorer /> }
