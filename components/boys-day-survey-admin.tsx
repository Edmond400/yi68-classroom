'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/client';
import { boysDayAdminApi, boysDayCopyFields, boysDaySurveyPath, type BoysDayCopyKey, type BoysDayResponse, type BoysDaySurvey } from '@/lib/boys-day-survey-model';
import { boysDaySurveyHtml } from '@/lib/boys-day-survey-html';
import styles from './boys-day-survey.module.css';

const copyKeys = Object.keys(boysDayCopyFields) as BoysDayCopyKey[];
const dateFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' });

export function BoysDaySurveyAdmin() {
  const [survey, setSurvey] = useState<BoysDaySurvey>();
  const [responses, setResponses] = useState<BoysDayResponse[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resultsError, setResultsError] = useState('');

  useEffect(() => {
    let active = true;
    api(boysDayAdminApi).then((data: { survey: BoysDaySurvey; responses: BoysDayResponse[] }) => {
      if (!active) return;
      setSurvey(data.survey);
      setResponses(data.responses);
    }).catch((error: Error) => {
      if (active) setError(error.message);
    });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!survey || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api(boysDayAdminApi, survey);
      setSurvey(data.survey);
      setMessage('已保存，填写页已更新。');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshResponses() {
    setResultsError('');
    try {
      const data = await api(boysDayAdminApi);
      setResponses(data.responses);
    } catch (error) {
      setResultsError((error as Error).message);
    }
  }

  if (!survey) return error ? <p className="callout error" role="alert">{error}</p> : <p className="callout" role="status">正在读取问卷…</p>;

  return <div className={styles.admin}>
    <form className="panel form-panel" onSubmit={save}>
      <div className={styles.toolbar}>
        <h2>问卷设置</h2>
        <a className="text-link" href={boysDaySurveyPath} target="_blank" rel="noreferrer">打开发送给同学的链接</a>
      </div>
      <fieldset className={styles.fieldset} disabled={busy}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={survey.open} onChange={event => setSurvey({ ...survey, open: event.target.checked })} />
          开放收集
        </label>
        <div className={styles.fields}>
          {copyKeys.map(key => {
            const field = boysDayCopyFields[key];
            const props = {
              value: survey.copy[key],
              maxLength: field.max,
              required: !('optional' in field),
              onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                setSurvey({ ...survey, copy: { ...survey.copy, [key]: event.target.value } });
              },
            };
            return <label className="survey-field" key={key}>
              {field.label}
              {'multiline' in field ? <textarea className={styles.textarea} rows={2} {...props} /> : <input {...props} />}
            </label>;
          })}
        </div>
        <div className={styles.actions}>
          <button className="btn" type="submit">{busy ? '正在保存…' : '保存并生效'}</button>
          <button className="btn secondary" type="button" aria-expanded={preview} aria-controls="boys-day-preview" onClick={() => setPreview(!preview)}>
            {preview ? '收起预览' : '手机预览'}
          </button>
        </div>
      </fieldset>
      {message && <p className="callout" role="status">{message}</p>}
      {error && <p className="callout error" role="alert">{error}</p>}
    </form>
    <div id="boys-day-preview" className={styles.preview} hidden={!preview}>
      {preview && <iframe title="问卷手机预览" sandbox="" srcDoc={boysDaySurveyHtml(survey, { preview: true })} />}
    </div>
    <section className="panel form-panel">
      <div className={styles.toolbar}>
        <h2>投稿（{responses.length}）</h2>
        <button className="btn secondary" type="button" onClick={refreshResponses}>刷新投稿</button>
      </div>
      {resultsError && <p className="callout error" role="alert">{resultsError}</p>}
      {responses.length === 0 && <p className="field-hint">目前还没有投稿。</p>}
      {responses.length > 0 && <ul className={styles.responses}>
        {responses.map(response => <li key={response.id}>
          <header className={styles.toolbar}>
            <h3>{response.name}</h3>
            <time className="field-hint" dateTime={response.created_at}>{dateFormat.format(new Date(response.created_at))}</time>
          </header>
          <dl>
            {response.pairs && <><dt>词对</dt><dd className={styles.text}>{response.pairs}</dd></>}
            {response.introduction && <><dt>自我介绍</dt><dd className={styles.text}>{response.introduction}</dd></>}
          </dl>
        </li>)}
      </ul>}
    </section>
  </div>;
}
