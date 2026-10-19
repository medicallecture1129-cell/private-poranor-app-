import React, { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../../firebase/config';

export default function App() {
  const [exams, setExams] = useState([]);
  const [examName, setExamName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [totalSets, setTotalSets] = useState(''); // Default empty
  const [questions, setQuestions] = useState([
    { 
      questionText: '', 
      options: [
        { text: '', isCorrect: true }, 
        { text: '', isCorrect: false }, 
        { text: '', isCorrect: false }, 
        { text: '', isCorrect: false }
      ] 
    }
  ]);
  const [isSaving, setIsSaving] = useState(false);

  // Real-time Firestore sync
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'exams'), (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.sets || data.masterQuestions || data.isOffline) {
          list.push({
            id: d.id,
            examId: data.examId || d.id,
            examName: data.examName || data.title || 'Untitled Exam',
            courseName: data.courseName || 'General',
            sets: data.sets || [],
            createdAt: data.createdAt || 0
          });
        }
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setExams(list);
    }, (err) => {
      console.error('Firestore exams listener error:', err);
    });

    return () => unsub();
  }, []);

  const handleAddQuestion = () => {
    setQuestions([
      ...questions, 
      { 
        questionText: '', 
        options: [
          { text: '', isCorrect: true }, 
          { text: '', isCorrect: false }, 
          { text: '', isCorrect: false }, 
          { text: '', isCorrect: false }
        ] 
      }
    ]);
  };

  const handleDeleteQuestion = (index) => {
    if (questions.length <= 1) {
      alert("At least one question is required.");
      return;
    }
    const updated = questions.filter((_, i) => i !== index);
    setQuestions(updated);
  };

  const handleSaveExam = async (e) => {
    e.preventDefault();
    if (!examName.trim() || !courseName.trim()) {
      alert("Please provide both Exam Name and Course Name.");
      return;
    }

    const validQuestions = questions.filter(q => q.questionText.trim() !== '');
    if (validQuestions.length === 0) {
      alert("Please enter at least one question.");
      return;
    }

    setIsSaving(true);
    const setsCount = Math.min(Math.max(parseInt(totalSets) || 4, 1), 20);
    const examId = 'offline_' + Date.now();

    try {
      // Generate sets
      const generatedSets = [];
      for (let i = 1; i <= setsCount; i++) {
        const setCode = String.fromCharCode(64 + i);
        const shuffledQuestions = [...validQuestions].sort(() => Math.random() - 0.5);

        const finalQuestions = shuffledQuestions.map((q, idx) => {
          const shuffledOpts = [...q.options].sort(() => Math.random() - 0.5);
          const correctIdx = shuffledOpts.findIndex(opt => opt.isCorrect);
          return {
            qNo: idx + 1,
            questionText: q.questionText,
            options: shuffledOpts.map(o => o.text),
            correctAnswer: correctIdx >= 0 ? correctIdx : 0
          };
        });

        generatedSets.push({
          setName: `Set ${setCode}`,
          setCode: setCode,
          questions: finalQuestions
        });
      }

      const newExam = {
        id: examId,
        examId,
        examName: examName.trim(),
        title: examName.trim(),
        courseName: courseName.trim(),
        courseId: 'general',
        masterQuestions: validQuestions,
        sets: generatedSets,
        totalSets: setsCount,
        totalQuestions: validQuestions.length,
        isOffline: true,
        examType: 'offline',
        isActive: true,
        createdAt: Date.now()
      };

      // 1. Direct Firestore write
      await setDoc(doc(db, 'exams', examId), newExam);

      // 2. Also notify backend API (non-blocking)
      fetch('/api/exams/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examName: examName.trim(),
          courseName: courseName.trim(),
          totalSets: setsCount,
          masterQuestions: validQuestions
        })
      }).catch(() => {});

      alert("Exam and Unique Sets saved to Firebase Firestore successfully!");
      setExamName('');
      setCourseName('');
      setTotalSets('');
      setQuestions([
        { 
          questionText: '', 
          options: [
            { text: '', isCorrect: true }, 
            { text: '', isCorrect: false }, 
            { text: '', isCorrect: false }, 
            { text: '', isCorrect: false }
          ] 
        }
      ]);
    } catch (err) {
      console.error('Error saving exam to Firestore:', err);
      alert("Failed to save to Firestore: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteExam = async (examId) => {
    if (confirm("Are you sure you want to permanently delete this exam from Firebase Firestore?")) {
      try {
        await deleteDoc(doc(db, 'exams', examId));
        fetch(`/api/exams/${examId}`, { method: 'DELETE' }).catch(() => {});
      } catch (err) {
        console.error('Error deleting exam:', err);
        alert("Failed to delete exam: " + err.message);
      }
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>EdTech Offline Exam & OMR Manager (Firebase Cloud Synced)</h2>

      {/* Exam & Master Questions Form */}
      <form onSubmit={handleSaveExam} style={{ background: '#f9f9f9', padding: '15px', marginBottom: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h3>Create Master Exam & Questions</h3>
        <input 
          type="text" 
          placeholder="Exam Name" 
          value={examName} 
          onChange={e => setExamName(e.target.value)} 
          required 
          style={{ marginRight: '10px', padding: '6px' }} 
        />
        <input 
          type="text" 
          placeholder="Course Name" 
          value={courseName} 
          onChange={e => setCourseName(e.target.value)} 
          required 
          style={{ marginRight: '10px', padding: '6px' }} 
        />
        <input 
          type="number" 
          placeholder="Number of Sets (Max 20)" 
          min="1" 
          max="20" 
          value={totalSets} 
          onChange={e => setTotalSets(e.target.value)} 
          style={{ marginRight: '10px', padding: '6px' }} 
        />
        <br/><br/>

        <h4>Master Questions List</h4>
        {questions.map((q, qIndex) => (
          <div key={qIndex} style={{ marginBottom: '10px', borderBottom: '1px dashed #ccc', paddingBottom: '8px' }}>
            <input 
              type="text" 
              placeholder={`Question ${qIndex + 1}`} 
              value={q.questionText} 
              onChange={e => {
                const updated = [...questions];
                updated[qIndex].questionText = e.target.value;
                setQuestions(updated);
              }} 
              style={{ width: '70%', padding: '6px', marginRight: '10px' }} 
            />
            
            <button 
              type="button" 
              onClick={() => handleDeleteQuestion(qIndex)} 
              style={{ background: '#e11d48', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
            >
              Delete Q
            </button>

            {/* Options */}
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
                    style={{ marginLeft: '4px', padding: '4px 8px', width: '130px' }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <button 
          type="button" 
          onClick={handleAddQuestion} 
          style={{ marginTop: '10px', padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          + Add More Question
        </button>
        <br/><br/>
        <button 
          type="submit" 
          disabled={isSaving}
          style={{ background: '#16a34a', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {isSaving ? "Saving to Firestore..." : "Save Exam & Generate Sets (Firestore)"}
        </button>
      </form>

      {/* Dashboard: Created Exams and Sets from Firestore */}
      <h3>Dashboard - Created Exams & Sets (Cloud Firestore)</h3>
      {exams.length === 0 ? (
        <p style={{ color: '#666' }}>No offline exams found in Firestore.</p>
      ) : (
        exams.map(exam => (
          <div key={exam.id || exam.examId} style={{ border: '1px solid #ccc', padding: '12px', marginBottom: '12px', borderRadius: '8px' }}>
            <h4>{exam.examName} ({exam.courseName})</h4>
            <button 
              onClick={() => handleDeleteExam(exam.id || exam.examId)} 
              style={{ background: '#b91c1c', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', marginBottom: '10px' }}
            >
              Delete Entire Exam
            </button>
            
            <div>
              <strong>Unique Sets Download Links:</strong>
              <ul>
                {exam.sets && exam.sets.map(set => (
                  <li key={set.setCode} style={{ margin: '6px 0' }}>
                    {set.setName} &nbsp;&nbsp;
                    <a 
                      href={`/api/exams/${exam.id || exam.examId}/set/${set.setCode}/pdf`} 
                      target="_blank" 
                      rel="noreferrer" 
                      style={{ background: '#2563eb', color: 'white', padding: '4px 10px', textDecoration: 'none', borderRadius: '4px', fontSize: '13px' }}
                    >
                      Download OMR + Question PDF
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
