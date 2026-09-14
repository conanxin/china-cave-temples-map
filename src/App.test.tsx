import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('research workspace', () => {
  it('shows the complete exhibition count without an AMap key', () => {
    render(<App />)
    const exhibitionStat = screen.getByText('展墙遗址').closest('div')
    expect(exhibitionStat).not.toBeNull()
    expect(within(exhibitionStat!).getByText('112')).toBeInTheDocument()
    expect(screen.getByText('等待高德 Key')).toBeInTheDocument()
  })

  it('opens the georeference workbench for the selected site', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '配准工作台' }))
    expect(screen.getByRole('dialog', { name: '地图配准工作台' })).toBeInTheDocument()
    expect(screen.getByText(/01 · 云冈石窟/)).toBeInTheDocument()
  })

  it('filters the textual index by search', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('搜索遗址'), '响堂山')
    expect(screen.getByRole('button', { name: /响堂山石窟/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /01 云冈石窟/ })).not.toBeInTheDocument()
  })
})
