<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    #[Override]
    public function getConnection(): ?string
    {
        return config('kradan.connection');
    }

    public function up(): void
    {
        Schema::connection($this->getConnection())->table('kradan_viewers', function (Blueprint $table): void {
            $table->string('step_key', 512)->nullable()->after('seen_prints');
            $table->unsignedInteger('round_number')->nullable()->after('step_key');
        });
    }

    public function down(): void
    {
        Schema::connection($this->getConnection())->table('kradan_viewers', function (Blueprint $table): void {
            $table->dropColumn(['step_key', 'round_number']);
        });
    }
};
