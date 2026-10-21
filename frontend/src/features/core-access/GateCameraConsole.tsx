import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  CameraIcon,
  CarProfileIcon,
  CheckCircleIcon,
  IdentificationCardIcon,
  PlusIcon,
  ScanIcon,
  ShieldCheckIcon,
  ShieldWarningIcon,
  TrashIcon,
  UploadSimpleIcon,
  UserFocusIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { paths } from '@/shared/config';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import type { VerificationView } from './api';

export type CameraRole = 'face' | 'plate' | 'overview' | 'barrier';
export type CameraSourceMode = 'idle' | 'webcam' | 'upload';

export interface IntegratedCameraFeed {
  id: string;
  name: string;
  role: CameraRole;
  enabled: boolean;
  sourceMode: CameraSourceMode;
  uploadedPreviewUrl: string | null;
  uploadedFile: File | null;
}

export interface GateCameraConsoleProps {
  mode: 'vehicle' | 'pedestrian';
  direction: 'ENTRY' | 'EXIT';
  gateId: string;
  eventId: string;
  captureBundleId: string;
  latestVerification: VerificationView | null;
  verifying: boolean;
  generatingBundle: boolean;
  onDirectionChange: (direction: 'ENTRY' | 'EXIT') => void;
  onGateIdChange: (gateId: string) => void;
  onCaptureOnly: (options: {
    access_mode: 'pedestrian' | 'motorcycle' | 'car' | 'truck';
    card_uid: string;
    faceImageFile?: File | null;
    plateImageFile?: File | null;
  }) => Promise<void>;
  onScanAndVerify: (options: {
    access_mode: 'pedestrian' | 'motorcycle' | 'car' | 'truck';
    card_uid: string;
    faceImageFile?: File | null;
    plateImageFile?: File | null;
  }) => Promise<void>;
}

const DEFAULT_VEHICLE_CAMERAS: IntegratedCameraFeed[] = [
  {
    id: 'CAM-01',
    name: 'Camera 1 — Khuôn mặt Nhân sự / Tài xế',
    role: 'face',
    enabled: true,
    sourceMode: 'idle',
    uploadedPreviewUrl: null,
    uploadedFile: null,
  },
  {
    id: 'CAM-02',
    name: 'Camera 2 — Biển số xe',
    role: 'plate',
    enabled: true,
    sourceMode: 'idle',
    uploadedPreviewUrl: null,
    uploadedFile: null,
  },
  {
    id: 'CAM-03',
    name: 'Camera 3 — Toàn cảnh làn xe',
    role: 'overview',
    enabled: false,
    sourceMode: 'idle',
    uploadedPreviewUrl: null,
    uploadedFile: null,
  },
  {
    id: 'CAM-04',
    name: 'Camera 4 — Khu vực thanh chắn Barrier',
    role: 'barrier',
    enabled: false,
    sourceMode: 'idle',
    uploadedPreviewUrl: null,
    uploadedFile: null,
  },
];

const DEFAULT_PEDESTRIAN_CAMERAS: IntegratedCameraFeed[] = [
  {
    id: 'CAM-PED-01',
    name: 'Camera 1 — Khuôn mặt Nhân sự',
    role: 'face',
    enabled: true,
    sourceMode: 'idle',
    uploadedPreviewUrl: null,
    uploadedFile: null,
  },
  {
    id: 'CAM-PED-02',
    name: 'Camera 2 — Làn cửa xoay đi bộ',
    role: 'overview',
    enabled: false,
    sourceMode: 'idle',
    uploadedPreviewUrl: null,
    uploadedFile: null,
  },
];

function describeFaceReason(reasonCode: string | null | undefined, score: number | null): string {
  const pct = score !== null ? `${Math.round(score * 100)}%` : '0%';
  switch (reasonCode) {
    case 'FACE_NOT_ENROLLED':
      return 'Chưa có hồ sơ khuôn mặt nào được đăng ký trong hệ thống (0%)';
    case 'FACE_IMAGE_REQUIRED':
      return 'Chưa có hình ảnh khuôn mặt từ Camera (0%) — Vui lòng mở Webcam hoặc tải ảnh';
    case 'FACE_NOT_DETECTED':
      return 'Không phát hiện được khuôn mặt rõ nét trong khung hình Camera (0%)';
    case 'FACE_MISMATCH':
      return `Khuôn mặt KHÔNG KHỚP với hồ sơ nhân sự đã đăng ký (Độ giống: ${pct})`;
    default:
      return `Xác minh khuôn mặt thất bại (${reasonCode || pct})`;
  }
}

export function GateCameraConsole({
  mode,
  direction,
  gateId,
  latestVerification,
  verifying,
  generatingBundle,
  onDirectionChange,
  onGateIdChange,
  onScanAndVerify,
}: GateCameraConsoleProps) {
  const [cameras, setCameras] = useState<IntegratedCameraFeed[]>(() =>
    mode === 'vehicle' ? DEFAULT_VEHICLE_CAMERAS : DEFAULT_PEDESTRIAN_CAMERAS,
  );
  const [focusedCameraId, setFocusedCameraId] = useState<string | null>(null);
  const [showAddCameraForm, setShowAddCameraForm] = useState(false);
  const [newCamName, setNewCamName] = useState('');
  const [newCamRole, setNewCamRole] = useState<CameraRole>(
    mode === 'vehicle' ? 'overview' : 'face',
  );

  // Thông tin thực tế bảo vệ nhập hoặc quẹt thẻ tại cổng
  const [vehicleMode, setVehicleMode] = useState<'car' | 'truck' | 'motorcycle'>('car');
  const [observedPlate, setObservedPlate] = useState('');
  const [cardUid, setCardUid] = useState('CARD-0001');
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const toggleWebcam = async () => {
    setWebcamError(null);
    if (webcamActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setWebcamActive(false);
      setCameras((prev) =>
        prev.map((cam) => (cam.sourceMode === 'webcam' ? { ...cam, sourceMode: 'idle' } : cam)),
      );
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setWebcamError('Trình duyệt không hỗ trợ kết nối Webcam trực tiếp.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setWebcamActive(true);
      setCameras((prev) =>
        prev.map((cam, idx) => (idx === 0 ? { ...cam, enabled: true, sourceMode: 'webcam' } : cam)),
      );
      setTimeout(() => {
        Object.values(videoRefs.current).forEach((el) => {
          if (el && streamRef.current) {
            el.srcObject = streamRef.current;
          }
        });
      }, 80);
    } catch {
      setWebcamError('Không thể truy cập Webcam. Vui lòng cấp quyền Camera hoặc chọn ảnh thực tế.');
    }
  };

  /** Chụp khung hình thực tế từ thẻ <video> của Webcam đang bật thành File JPEG */
  const captureFrameFromVideo = async (camId: string): Promise<File | null> => {
    const video = videoRefs.current[camId];
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<File | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(
            new File([blob], `camera-${camId}-${Date.now()}.jpg`, {
              type: 'image/jpeg',
            }),
          );
        },
        'image/jpeg',
        0.92,
      );
    });
  };

  const handleUploadCameraImage = (camId: string, file: File | null) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setCameras((prev) =>
      prev.map((cam) =>
        cam.id === camId
          ? {
              ...cam,
              enabled: true,
              sourceMode: 'upload',
              uploadedPreviewUrl: previewUrl,
              uploadedFile: file,
            }
          : cam,
      ),
    );
  };

  const handleAddCamera = () => {
    const nextIndex = cameras.length + 1;
    const trimmedName = newCamName.trim() || `Camera ${nextIndex} — Góc phụ`;
    const nextId = mode === 'vehicle' ? `CAM-0${nextIndex}` : `CAM-PED-0${nextIndex}`;
    const nextCam: IntegratedCameraFeed = {
      id: nextId,
      name: trimmedName,
      role: newCamRole,
      enabled: true,
      sourceMode: 'idle',
      uploadedPreviewUrl: null,
      uploadedFile: null,
    };
    setCameras((prev) => [...prev, nextCam]);
    setNewCamName('');
    setShowAddCameraForm(false);
  };

  const handleRemoveCamera = (camId: string) => {
    setCameras((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((c) => c.id !== camId);
    });
    if (focusedCameraId === camId) {
      setFocusedCameraId(null);
    }
  };

  const setActiveCameraCount = (count: number) => {
    setFocusedCameraId(null);
    setCameras((prev) =>
      prev.map((cam, index) => ({
        ...cam,
        enabled: index < count,
      })),
    );
  };

  const handleScanAndVerifyClick = async () => {
    const faceCam = cameras.find((c) => c.role === 'face');
    const plateCam = cameras.find((c) => c.role === 'plate');

    let faceFile: File | null = faceCam?.uploadedFile ?? null;
    if (!faceFile && faceCam && webcamActive) {
      faceFile = await captureFrameFromVideo(faceCam.id);
    }

    let plateFile: File | null = plateCam?.uploadedFile ?? null;
    if (!plateFile && plateCam && webcamActive) {
      plateFile = await captureFrameFromVideo(plateCam.id);
    }

    await onScanAndVerify({
      access_mode: mode === 'pedestrian' ? 'pedestrian' : vehicleMode,
      card_uid: cardUid.trim() || 'CARD-0001',
      faceImageFile: faceFile,
      plateImageFile: plateFile,
    });
  };

  const activeCameras = cameras.filter((c) => c.enabled);
  const displayedCameras = focusedCameraId
    ? activeCameras.filter((c) => c.id === focusedCameraId)
    : activeCameras.length > 0
      ? activeCameras
      : cameras.slice(0, 1);

  const faceFactor = latestVerification?.factors.find((f) => f.factor === 'face');
  const plateFactor = latestVerification?.factors.find((f) => f.factor === 'plate');

  const isGateOpened =
    latestVerification?.verification_status === 'PASSED' &&
    latestVerification?.permit_granted === true &&
    latestVerification?.barrier_status === 'OPENED';

  const isGateRejected =
    latestVerification !== null &&
    (latestVerification.verification_status === 'FAILED' || !latestVerification.permit_granted);

  const gridClass =
    displayedCameras.length === 1
      ? 'grid-cols-1'
      : displayedCameras.length === 3
        ? 'grid-cols-1 lg:grid-cols-3'
        : 'grid-cols-1 md:grid-cols-2';

  return (
    <SpotlightCard
      className="space-y-4 border-2 border-[var(--color-border)]"
      data-testid="gate-camera-console"
    >
      {/* THANH TIÊU ĐỀ ĐƠN GIẢN, DỄ DÙNG CHO BẢO VỆ */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <VideoCameraIcon size={22} weight="duotone" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold">
                {mode === 'vehicle'
                  ? 'Bàn trực Bảo vệ — Kiểm tra Nhân sự & Biển số xe'
                  : 'Bàn trực Bảo vệ — Kiểm tra Nhân sự qua cổng'}
              </h2>
              <Badge tone={isGateOpened ? 'success' : isGateRejected ? 'danger' : 'info'}>
                {isGateOpened
                  ? 'CỔNG ĐANG MỞ CHO QUA'
                  : isGateRejected
                    ? 'TỪ CHỐI — GIỮ ĐÓNG CỔNG'
                    : 'CỔNG ĐANG ĐÓNG AN TOÀN'}
              </Badge>
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              Mở Webcam hoặc chọn ảnh thực tế từ Camera để đối chiếu trực tiếp với hồ sơ nhận diện đã
              đăng ký trong hệ thống.
            </p>
          </div>
        </div>

        {/* Bộ điều khiển số lượng Camera tích hợp */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--color-muted)] mr-1">Số màn hình:</span>
          {[1, 2, 3, 4]
            .filter((n) => n <= Math.max(4, cameras.length))
            .map((count) => {
              const isCurrent = !focusedCameraId && activeCameras.length === count;
              return (
                <Button
                  key={count}
                  type="button"
                  size="sm"
                  variant={isCurrent ? 'primary' : 'secondary'}
                  onClick={() => setActiveCameraCount(count)}
                >
                  {count} Camera
                </Button>
              );
            })}
          <Button
            type="button"
            size="sm"
            variant={webcamActive ? 'danger' : 'secondary'}
            icon={webcamActive ? <VideoCameraSlashIcon size={15} /> : <CameraIcon size={15} />}
            onClick={() => void toggleWebcam()}
          >
            {webcamActive ? 'Tắt Webcam' : 'Mở Webcam'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={<PlusIcon size={15} />}
            onClick={() => setShowAddCameraForm((prev) => !prev)}
          >
            + Thêm Camera
          </Button>
        </div>
      </div>

      {/* HỘP THÊM CAMERA */}
      {showAddCameraForm && (
        <div
          className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] flex flex-wrap items-end gap-3"
          data-testid="gate-camera-integrator"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-1">Tên Camera muốn thêm</label>
            <Input
              value={newCamName}
              onChange={(e) => setNewCamName(e.target.value)}
              placeholder="Ví dụ: Camera Thùng xe / Cổng phụ..."
            />
          </div>
          <div className="w-56">
            <label className="block text-xs font-medium mb-1">Vị trí quan sát</label>
            <Select
              value={newCamRole}
              onChange={(e) => setNewCamRole(e.target.value as CameraRole)}
            >
              <option value="face">Quét Khuôn mặt Nhân sự</option>
              <option value="plate">Quét Biển số xe</option>
              <option value="overview">Toàn cảnh làn xe</option>
              <option value="barrier">Khu vực thanh chắn</option>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="primary"
            icon={<PlusIcon size={15} />}
            onClick={handleAddCamera}
          >
            Thêm vào màn hình
          </Button>
        </div>
      )}

      {webcamError && (
        <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200 flex items-center gap-2">
          <WarningIcon size={16} className="shrink-0 text-amber-400" />
          <span>{webcamError}</span>
        </div>
      )}

      {/* CẢNH BÁO TỪ MÁY CHỦ KHI KHUÔN MẶT CHƯA ĐĂNG KÝ HOẶC KHÔNG KHỚP */}
      {isGateRejected && latestVerification && (
        <div
          role="alert"
          data-testid="gate-camera-active-alerts"
          className="p-3.5 rounded-xl border-2 border-rose-500 bg-rose-500/15 text-rose-100 flex flex-wrap items-center justify-between gap-3 text-sm font-semibold"
        >
          <div className="flex items-center gap-2.5">
            <ShieldWarningIcon size={22} weight="fill" className="text-rose-400 shrink-0" />
            <span>
              {faceFactor?.status === 'FAILED'
                ? describeFaceReason(faceFactor.reason_code, faceFactor.score)
                : `Từ chối mở cổng (${latestVerification.reason_codes.join(', ')}) — Cổng giữ khóa an toàn!`}
            </span>
          </div>
          <Link to={paths.drivers} className="button button--secondary button--sm">
            Mở trang Đăng ký khuôn mặt (/people/enrollments)
          </Link>
        </div>
      )}

      {/* MÀN HÌNH CAMERA CHÍNH */}
      <div className={`grid ${gridClass} gap-4`} data-testid="gate-camera-grid">
        {displayedCameras.map((cam) => {
          const factorForCam =
            cam.role === 'face' ? faceFactor : cam.role === 'plate' ? plateFactor : undefined;
          const isCamFailed = factorForCam?.status === 'FAILED';
          const isCamPassed = factorForCam?.status === 'PASSED';

          return (
            <div
              key={cam.id}
              data-testid={`camera-viewport-${cam.id}`}
              className={`relative rounded-xl overflow-hidden border-2 transition-all bg-slate-950 flex flex-col justify-between min-h-[260px] md:min-h-[300px] ${
                isCamFailed
                  ? 'border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.3)]'
                  : isCamPassed
                    ? 'border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.25)]'
                    : 'border-slate-700'
              }`}
            >
              {/* Nguồn hình Camera thực tế */}
              {cam.sourceMode === 'webcam' && webcamActive ? (
                <video
                  ref={(el) => {
                    videoRefs.current[cam.id] = el;
                    if (el && streamRef.current && el.srcObject !== streamRef.current) {
                      el.srcObject = streamRef.current;
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : cam.sourceMode === 'upload' && cam.uploadedPreviewUrl ? (
                <img
                  src={cam.uploadedPreviewUrl}
                  alt={cam.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-slate-950" />
              )}

              {/* Thanh tiêu đề trên từng màn Camera */}
              <div className="relative z-10 flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-950/85 border-b border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isCamFailed
                        ? 'bg-rose-500 animate-ping'
                        : cam.sourceMode !== 'idle'
                          ? 'bg-emerald-400 animate-pulse'
                          : 'bg-slate-500'
                    }`}
                  />
                  <span className="font-bold text-slate-100 text-sm">{cam.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge
                    tone={
                      isCamFailed
                        ? 'danger'
                        : isCamPassed
                          ? 'success'
                          : cam.sourceMode !== 'idle'
                            ? 'info'
                            : 'neutral'
                    }
                  >
                    {isCamFailed
                      ? 'Không khớp!'
                      : isCamPassed
                        ? `Hợp lệ (${Math.round((factorForCam.score ?? 0) * 100)}%)`
                        : cam.sourceMode === 'webcam'
                          ? 'Đang bật Webcam'
                          : cam.sourceMode === 'upload'
                            ? 'Đã có ảnh'
                            : 'Chờ mở Camera'}
                  </Badge>
                  <button
                    type="button"
                    title={focusedCameraId === cam.id ? 'Thu nhỏ' : 'Phóng to toàn màn hình'}
                    onClick={() =>
                      setFocusedCameraId((prev) => (prev === cam.id ? null : cam.id))
                    }
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    {focusedCameraId === cam.id ? (
                      <ArrowsInSimpleIcon size={14} />
                    ) : (
                      <ArrowsOutSimpleIcon size={14} />
                    )}
                  </button>
                  {cameras.length > 1 && (
                    <button
                      type="button"
                      title="Ẩn bớt Camera này"
                      onClick={() => handleRemoveCamera(cam.id)}
                      className="p-1.5 rounded bg-slate-800 hover:bg-rose-900/70 text-slate-300"
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Vùng hiển thị trung tâm: Trung thực 100%, không bịa phần trăm hay tên giả */}
              <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-5">
                {cam.role === 'face' && (
                  <div
                    className={`w-64 rounded-2xl border-2 border-dashed flex flex-col items-center justify-between p-4 gap-2 transition-all ${
                      isCamFailed
                        ? 'border-rose-400 bg-rose-950/60'
                        : isCamPassed
                          ? 'border-emerald-400 bg-emerald-950/50'
                          : 'border-slate-600 bg-slate-900/60'
                    }`}
                  >
                    <UserFocusIcon
                      size={52}
                      weight="duotone"
                      className={
                        isCamFailed
                          ? 'text-rose-400'
                          : isCamPassed
                            ? 'text-emerald-300'
                            : 'text-slate-400'
                      }
                    />
                    <div className="text-center space-y-1">
                      {factorForCam ? (
                        <>
                          <p className="text-xs font-bold text-white">
                            {isCamPassed
                              ? 'Đã xác nhận đúng khuôn mặt nhân sự'
                              : describeFaceReason(factorForCam.reason_code, factorForCam.score)}
                          </p>
                          <Badge tone={isCamPassed ? 'success' : 'danger'}>
                            Điểm khớp AI thực tế:{' '}
                            {factorForCam.score !== null
                              ? `${Math.round(factorForCam.score * 100)}%`
                              : '0%'}
                          </Badge>
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-slate-200">
                            {cam.sourceMode === 'idle'
                              ? 'Chưa có hình ảnh khuôn mặt'
                              : 'Sẵn sàng chụp & đối chiếu khuôn mặt'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {cam.sourceMode === 'idle'
                              ? 'Hãy bấm "Mở Webcam" hoặc "Chọn ảnh thực tế"'
                              : 'Bấm "Kiểm tra & Duyệt mở cổng ngay" bên dưới'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {cam.role === 'plate' && (
                  <div className="w-72 rounded-2xl border-2 border-dashed border-sky-400/70 bg-slate-900/65 flex flex-col items-center justify-between p-4 gap-2.5">
                    <span className="text-xs uppercase tracking-wider text-slate-300">
                      Biển số phương tiện tại cổng
                    </span>
                    <div className="px-5 py-2 rounded-lg bg-white text-slate-950 font-mono font-black text-xl tracking-widest border-2 border-slate-400 shadow">
                      {observedPlate.trim() || 'CHƯA NHẬP / QUÉT'}
                    </div>
                    {factorForCam && (
                      <Badge tone={factorForCam.status === 'PASSED' ? 'success' : 'danger'}>
                        Kết quả Biển số: {factorForCam.status}
                      </Badge>
                    )}
                  </div>
                )}

                {cam.role === 'overview' && (
                  <div className="w-64 rounded-2xl border border-slate-700 bg-slate-900/60 flex flex-col items-center justify-between p-4 gap-2">
                    <CarProfileIcon size={44} weight="duotone" className="text-slate-300" />
                    <p className="text-xs font-semibold text-slate-200 text-center">
                      Camera quan sát toàn cảnh làn kiểm soát
                    </p>
                  </div>
                )}

                {cam.role === 'barrier' && (
                  <div className="w-64 rounded-2xl border border-slate-700 bg-slate-900/60 flex flex-col items-center justify-between p-4 gap-2">
                    <ShieldCheckIcon size={44} weight="duotone" className="text-slate-300" />
                    <p className="text-xs font-semibold text-slate-200 text-center">
                      {isGateOpened ? 'Thanh chắn Barrier đã mở' : 'Thanh chắn Barrier đang đóng'}
                    </p>
                  </div>
                )}
              </div>

              {/* Chân màn hình Camera */}
              <div className="relative z-10 flex items-center justify-between px-3.5 py-2 bg-slate-950/85 border-t border-slate-800 text-xs">
                <span className="text-slate-400">
                  {cam.sourceMode === 'webcam'
                    ? 'Đang lấy hình trực tiếp từ Webcam'
                    : cam.sourceMode === 'upload'
                      ? `Ảnh đã chọn: ${cam.uploadedFile?.name ?? ''}`
                      : 'Chưa có nguồn hình'}
                </span>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium">
                  <UploadSimpleIcon size={13} />
                  <span>Chọn ảnh thực tế</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleUploadCameraImage(cam.id, e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {/* BẢNG THAO TÁC GỌN GÀNG CHO BẢO VỆ: THẺ NHÂN SỰ + SỐ XE + NÚT DUYỆT */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1"
        data-testid="gate-telemetry-strip"
      >
        <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] flex items-center gap-1.5">
            <IdentificationCardIcon size={16} />
            1. Mã thẻ Nhân sự / Tài xế
          </span>
          <Input
            aria-label="Mã thẻ RFID tại cổng"
            value={cardUid}
            onChange={(e) => setCardUid(e.target.value)}
            placeholder="Nhập hoặc quẹt mã thẻ tại cổng..."
          />
        </div>

        {mode === 'vehicle' ? (
          <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] flex items-center gap-1.5">
              <CarProfileIcon size={16} />
              2. Biển số xe & Loại xe
            </span>
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="Biển số xe quan sát"
                value={observedPlate}
                onChange={(e) => setObservedPlate(e.target.value.toUpperCase())}
                placeholder="Nhập số xe..."
              />
              <Select
                aria-label="Loại phương tiện camera nhận diện"
                value={vehicleMode}
                onChange={(e) => setVehicleMode(e.target.value as 'car' | 'truck' | 'motorcycle')}
              >
                <option value="car">Ô tô</option>
                <option value="truck">Xe tải</option>
                <option value="motorcycle">Xe máy</option>
              </Select>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">
              2. Cổng trực đi bộ
            </span>
            <p className="text-sm font-bold">{gateId}</p>
            <p className="text-xs text-[var(--color-muted)]">
              Chiều: {direction === 'ENTRY' ? 'Nhân sự đi vào' : 'Nhân sự đi ra'}
            </p>
          </div>
        )}

        <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] flex flex-col justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">
            3. Quét AI & Duyệt mở cổng
          </span>
          <Button
            type="button"
            variant="primary"
            pending={verifying || generatingBundle}
            icon={<ScanIcon size={18} />}
            onClick={() => void handleScanAndVerifyClick()}
          >
            KIỂM TRA & DUYỆT MỞ CỔNG NGAY
          </Button>
        </div>
      </div>

      {/* KẾT QUẢ XÁC MINH RÕ RÀNG */}
      {latestVerification && (
        <div
          className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
            isGateOpened
              ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/60 bg-rose-500/10 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5 text-sm font-bold">
            {isGateOpened ? (
              <CheckCircleIcon size={22} weight="fill" className="text-emerald-400" />
            ) : (
              <ShieldWarningIcon size={22} weight="fill" className="text-rose-400" />
            )}
            <span>
              {isGateOpened
                ? 'ĐÃ XÁC MINH ĐÚNG NHÂN SỰ — CỔNG BARRIER ĐÃ MỞ!'
                : 'TỪ CHỐI MỞ CỔNG — KHUÔN MẶT CHƯA ĐĂNG KÝ HOẶC KHÔNG HỢP LỆ!'}
            </span>
          </div>
          <span className="text-xs opacity-80">
            Mã lượt: {latestVerification.event_id} · Cổng: {latestVerification.gate_id}
          </span>
        </div>
      )}

      <div className="hidden">
        <button type="button" onClick={() => onDirectionChange(direction)}>
          Sync Direction
        </button>
        <button type="button" onClick={() => onGateIdChange(gateId)}>
          Sync Gate
        </button>
      </div>
    </SpotlightCard>
  );
}
