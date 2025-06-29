const validateEnv = () => {
    const requiredVars = [
        'PORT',
        'MONGODB_URI',
        'JWT_SECRET',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_REGION',
        'AWS_S3_BUCKET'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        console.error(' Missing required environment variables:');
        missingVars.forEach(varName => {
            console.error(`   - ${varName}`);
        });
        console.error('\n Please check .env.example for reference');
        process.exit(1);
    }

    console.log('All environment variables are set');
};

module.exports = validateEnv;