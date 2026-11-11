import React, { useState } from 'react';

const statuses = { unread: 'Por ler', reading: 'A ler', finished: 'Lido' };

export function ReadingFields({ form, update }) {
  const [date, setDate] = useState('');
  const completions = form.completions ?? [];
  return <fieldset className="full reading-fields">
    <legend>Leitura</legend>
    <label>Estado<select value={form.readingStatus ?? 'unread'} onChange={event => update('readingStatus', event.target.value)}>
      {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <div className="reading-date">
      <label>Data de conclusão<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label>
      <button type="button" className="button secondary" disabled={!date} onClick={() => {
        update('completions', [...completions, date]);
        update('readingStatus', 'finished');
        setDate('');
      }}>Registar conclusão</button>
    </div>
    {completions.length > 0 && <ul>{completions.map((entry, index) => <li key={index}>
      <time dateTime={entry}>{entry}</time>{' '}
      <button type="button" className="text-button" aria-label={`Remover conclusão de ${entry}`}
        onClick={() => update('completions', completions.filter((_, position) => position !== index))}>Remover</button>
    </li>)}</ul>}
  </fieldset>;
}

export function ReadingReport({ items }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const authors = new Map();
  const genres = new Map();
  let total = 0;
  for (const item of items) {
    const count = (item.completions ?? []).filter(date => (!start || date >= start) && (!end || date <= end)).length;
    if (!count) continue;
    total += count;
    for (const [group, label] of [[authors, item.author], [genres, item.category]]) {
      const name = label?.trim() || 'Por indicar';
      const key = name.toLocaleLowerCase('pt-PT');
      const previous = group.get(key);
      group.set(key, { name: previous?.name ?? name, count: (previous?.count ?? 0) + count });
    }
  }
  const sections = [['Autor', 'Autores mais lidos', authors], ['Género', 'Géneros mais lidos', genres]].map(
    ([type, title, group]) => [type, title, [...group.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-PT'))]
  );
  function download() {
    const escape = value => {
      const string = String(value);
      const safe = /^[\s]*[=+@-]/.test(string) ? "'" + string : string;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    const rows = sections.flatMap(([type, , entries]) => entries.map(({ name, count }) => [type, name, count, start, end]));
    const csv = [['Grupo', 'Nome', 'Conclusões', 'Desde', 'Até'], ...rows].map(row => row.map(escape).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'relatorio-leituras.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="reading-report">
    <h2>Relatório de leitura</h2>
    <p>Cada conclusão registada conta como uma leitura, incluindo releituras. O período inclui ambas as datas.</p>
    <div className="reading-date">
      <label>Desde<input type="date" value={start} max={end || undefined} onChange={event => setStart(event.target.value)}/></label>
      <label>Até<input type="date" value={end} min={start || undefined} onChange={event => setEnd(event.target.value)}/></label>
      <button className="button secondary" onClick={download}>Exportar CSV</button>
    </div>
    <p>{total} {total === 1 ? 'leitura concluída' : 'leituras concluídas'}</p>
    <div className="report-tables">{sections.map(([type, title, entries]) => <table key={type}>
      <caption>{title}</caption><thead><tr><th scope="col">{type}</th><th scope="col">Conclusões</th></tr></thead>
      <tbody>{entries.map(({ name, count }) => <tr key={name}><td>{name}</td><td>{count}</td></tr>)}</tbody>
    </table>)}</div>
  </section>;
}
