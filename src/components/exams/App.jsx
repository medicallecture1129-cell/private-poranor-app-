import React, { useState, useEffect } from 'react';

export default function App() {
  const [exams, setExams] = useState([]);
  const [examName, setExamName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [totalSets, setTotalSets] = useState(''); // ডিফল্ট ফাঁকা
  const [questions, setQuestions] = useState([{ questionText: '', options: [{text:'', isCorrect:false}, {text:'', isCorrect:false}, {text:'', isCorrect:false}, {text:'', isCorrect:false}] }]);

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      // First try relative /api/exams for unified dev server on port 3000
      let res = await fetch('/api/exams');
      if (!res.ok) {
        // Fallback to port 5000 if standalone server is running
        res = await fetch('http://localhost:5000/api/exams');
      }
      const data = await res.json();
      setExams(Array.isArray(data) ? data : []);
    } catch (e) {
      try {
        const res5000 = await fetch('http://localhost:5000/api/exams');
        const data = await res5000.json();
        setExams(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch exams:', err);
      }
    }
  };

  const handleAddQuestion = () => {
    setQuestions([...questions, { questionText: '', options: [{text:'', isCorrect:false}, {text:'', isCorrect:false}, {text:'', isCorrect:false}, {text:'', isCorrect:false}] }]);
  };

  const handleDeleteQuestion = (index) => {
    const updated = questions.filter((_, i) => i !== index);
    setQuestions(updated);
  };

  const handleSaveExam = async (e) => {
    e.preventDefault();
    const payload = { examName, courseName, totalSets: parseInt(totalSets) || 5, masterQuestions: questions };
    
    try {
      let res = await fetch('/api/exams/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        res = await fetch('http://localhost:5000/api/exams/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      
      if(res.ok) {
        alert("Exam created successfully!");
        setExamName('');
        setCourseName('');
        setTotalSets('');
        setQuestions([{ questionText: '', options: [{text:'', isCorrect:false}, {text:'', isCorrect:false}, {text:'', isCorrect:false}, {text:'', isCorrect:false}] }]);
        fetchExams();
      }
    } catch (err) {
      alert("Error creating exam: " + err.message);
    }
  };

  const handleDeleteExam = async (examId) => {
    if(confirm("Are you sure to delete this exam?")) {
      try {
        let res = await fetch(`/api/exams/${examId}`, { method: 'DELETE' });
        if (!res.ok) {
          await fetch(`http://localhost:5000/api/exams/${examId}`, { method: 'DELETE' });
        }
        fetchExams();
      } catch (err) {
        alert("Error deleting exam: " + err.message);
      }
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h2>EdTech Offline Exam & OMR Manager</h2>

      {/* এক্সাম ও মাস্টার প্রশ্ন তৈরির ফর্ম */}
      <form onSubmit={handleSaveExam} style={{ background: '#f9f9f9', padding: '15px', marginBottom: '20px', border: '1px solid #ddd' }}>
        <h3>Create Master Exam & Questions</h3>
        <input type="text" placeholder="Exam Name" value={examName} onChange={e => setExamName(e.target.value)} required style={{ marginRight: '10px', padding: '5px' }} />
        <input type="text" placeholder="Course Name" value={courseName} onChange={e => setCourseName(e.target.value)} required style={{ marginRight: '10px', padding: '5px' }} />
        <input type="number" placeholder="Number of Sets (Max 20)" min="1" max="20" value={totalSets} onChange={e => setTotalSets(e.target.value)} style={{ marginRight: '10px', padding: '5px' }} />
        <br/><br/>

        <h4>Master Questions List</h4>
        {questions.map((q, qIndex) => (
          <div key={qIndex} style={{ marginBottom: '10px', borderBottom: '1px dashed #ccc', paddingBottom: '5px' }}>
            <input type="text" placeholder={`Question ${qIndex + 1}`} value={q.questionText} onChange={e => {
              const updated = [...questions];
              updated[qIndex].questionText = e.target.value;
              setQuestions(updated);
            }} style={{ width: '70%', padding: '5px', marginRight: '10px' }} />
            
            <button type="button" onClick={() => handleDeleteQuestion(qIndex)} style={{ background: 'red', color: 'white', border: 'none', padding: '5px 10px' }}>Delete Q</button>

            {/* Options Input */}
            <div style={{ marginTop: '8px', marginLeft: '10px' }}>
              {q.options.map((opt, oIndex) => (
                <div key={oIndex} style={{ display: 'inline-block', marginRight: '15px', marginBottom: '5px' }}>
                  <label style={{ fontSize: '12px' }}>
                    <input
                      type="radio"
                      name={`correct-${qIndex}`}
                      checked={opt.isCorrect}
                      onChange={() => {
                        const updated = [...questions];
                        updated[qIndex].options = updated[qIndex].options.map((o, idx) => ({
                          ...o,
                          isCorrect: idx === oIndex
                        }));
                        setQuestions(updated);
                      }}
                      style={{ marginRight: '4px' }}
                    />
                    Opt {String.fromCharCode(65 + oIndex)}:
                  </label>
                  <input
                    type="text"
                    value={opt.text}
                    placeholder={`Option ${String.fromCharCode(65 + oIndex)}`}
                    onChange={(e) => {
                      const updated = [...questions];
                      updated[qIndex].options[oIndex].text = e.target.value;
                      setQuestions(updated);
                    }}
                    style={{ marginLeft: '4px', padding: '3px 6px', width: '120px' }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <button type="button" onClick={handleAddQuestion} style={{ marginTop: '10px', padding: '5px 10px' }}>+ Add More Question</button>
        <br/><br/>
        <button type="submit" style={{ background: 'green', color: 'white', padding: '10px 20px', border: 'none' }}>Save Exam & Generate Sets</button>
      </form>

      {/* ড্যাশবোর্ড: এক্সাম ও ইউনিক সেটের পিডিএফ ডাউনলোড লিস্ট */}
      <h3>Dashboard - Created Exams & Sets</h3>
      {exams.map(exam => (
        <div key={exam.examId} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
          <h4>{exam.examName} ({exam.courseName})</h4>
          <button onClick={() => handleDeleteExam(exam.examId)} style={{ background: 'darkred', color: 'white', border: 'none', padding: '3px 8px', marginBottom: '10px' }}>Delete Entire Exam</button>
          
          <div>
            <strong>Unique Sets Download Links:</strong>
            <ul>
              {exam.sets && exam.sets.map(set => (
                <li key={set.setCode} style={{ margin: '5px 0' }}>
                  {set.setName} &nbsp;&nbsp;
                  <a href={`/api/exams/${exam.examId}/set/${set.setCode}/pdf`} target="_blank" rel="noreferrer" style={{ background: 'blue', color: 'white', padding: '3px 8px', textDecoration: 'none', borderRadius: '3px' }}>
                    Download OMR + Question PDF
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}
