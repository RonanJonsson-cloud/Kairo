// The page frame: a header with the title, then the content.
function Layout({ title, tagline, banner = null, children }) {
  return (
    <div className="app">
      <header className="app-header">
        <h1>{title}</h1>
        {tagline && <p className="tagline">{tagline}</p>}
      </header>
      <main className="content">
        {banner}
        {children}
      </main>
    </div>
  )
}

export default Layout
