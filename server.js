console.log("=== BẮT ĐẦU CHẠY SERVER ===");

const express = require('express');
const sql = require('mssql/msnodesqlv8');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Cấu hình chỉ định driver trực tiếp
const config = {
    connectionString: 'Driver={SQL Server};Server=DESKTOP-KMNS09Q;Database=APAG_QuanLyPhongHoc;Trusted_Connection=yes;',
    driver: 'msnodesqlv8'
};

console.log("🔄 Đang chuẩn bị kết nối SQL Server tại DESKTOP-KMNS09Q...");

sql.connect(config)
    .then(pool => {
        console.log('✅ KẾT NỐI CSDL CỰC KỲ THÀNH CÔNG!');

        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });
        
        // 1. API Lấy danh sách phòng học
        app.get('/api/phong-hoc', async (req, res) => {
            try {
                let result = await sql.query('SELECT * FROM vw_PhongTrongTheoThoiGian');
                res.json({ success: true, data: result.recordset });
            } catch (err) {
                res.status(500).json({ success: false, message: err.message });
            }
        });

        // 2. API Kiểm tra phòng trống
        app.post('/api/kiem-tra-phong-trong', async (req, res) => {
            const { thu, caHoc, tietBatDau, tietKetThuc, sucChuaToiThieu } = req.body;
            try {
                let request = new sql.Request();
                request.input('Thu', sql.Int, thu);
                request.input('CaHoc', sql.NVarChar, caHoc);
                request.input('TietBatDau', sql.Int, tietBatDau);
                request.input('TietKetThuc', sql.Int, tietKetThuc);
                request.input('SucChuaToiThieu', sql.Int, sucChuaToiThieu || 1);

                let result = await request.execute('sp_KiemTraPhongTrong');
                res.json({ success: true, data: result.recordset });
            } catch (err) {
                res.status(500).json({ success: false, message: err.message });
            }
        });

        app.listen(5000, () => {
            console.log('🚀 SERVER ĐÃ CHẠY TẠI http://localhost:5000');
        });
    })
    .catch(err => {
        console.error('❌ LỖI KẾT NỐI CSDL:', err);
    });
    