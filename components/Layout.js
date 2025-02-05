// components/Layout.js
import Header from './Header'
import '../styles/globals.css' // Ensure your globals are imported here

export default function Layout({ children }) {
  return (
	<div className="min-h-screen flex flex-col">
	  <Header />
	  <main className="flex-grow container mx-auto px-4 py-6">
		{children}
	  </main>
	</div>
  )
}
