'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="panel unavailable"><h1>页面暂时无法加载</h1><p className="muted">你可以重新尝试。</p><button className="btn" onClick={reset}>重试</button></section>}
